// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

/**
 * @title JustTLDSubdomains
 * @notice Поддомены внутри зон JustTLD: отдельный контракт, который читает зоны
 *         из основного реестра JustTLDRegistry и хранит поддомены у себя.
 * @dev Почему отдельно: после репрайсинга газа (2026) код дорожает примерно в 7.8 раза,
 *      и лимит транзакции 16 777 216 газа вмещает не больше ~10 КБ рантайма. Монолитный
 *      реестр с поддоменами (24 КБ) в такую сеть просто не помещается, поэтому
 *      поддомены вынесены в отдельный контракт, а зоны остаются в уже развёрнутом реестре.
 */
interface IJustTLDRegistry {
    function ownerOf(string calldata tld) external view returns (address);

    function exists(string calldata tld) external view returns (bool);

    function isBlocked(string calldata tld) external view returns (bool);

    // Важно: реестр возвращает именно структуру (dynamic tuple). Объявлять её как
    // плоский список (address, uint64, …) нельзя — кодировка отличается на слово смещения,
    // и вызов падает с «returned an unexpected amount of data».
    struct Zone {
        address owner;
        uint64 registeredAt;
        uint64 expiresAt;
        uint64 updatedAt;
        bool blocked;
        string metadata;
    }

    function getTLD(string calldata tld) external view returns (Zone memory);
}

contract JustTLDSubdomains {
    /// @notice Зона, которой принадлежат поддомены.
    IJustTLDRegistry public immutable registry;

    /// @notice Владелец контракта: единственный, кто может блокировать поддомены.
    address public owner;

    /// @notice Период, который добавляет регистрация и каждое продление.
    uint64 public constant REGISTRATION_PERIOD = 365 days;

    /// @notice Минимальная/максимальная длина метки поддомена.
    uint256 public constant MIN_LABEL_LENGTH = 1;
    uint256 public constant MAX_LABEL_LENGTH = 32;

    /// @notice Максимальная длина метаданных (и причины блокировки) в байтах.
    uint256 public constant MAX_METADATA_LENGTH = 512;

    struct Subdomain {
        /// @notice Владелец поддомена (может отличаться от владельца зоны).
        address owner;
        /// @notice Владелец зоны на момент регистрации — «поколение» зоны.
        address zoneOwner;
        /// @notice Когда поддомен зарегистрирован.
        uint64 registeredAt;
        /// @notice Когда истекает (никогда не позже срока зоны).
        uint64 expiresAt;
        /// @notice Когда последний раз менялись владелец/метаданные/срок.
        uint64 updatedAt;
        /// @notice Заблокирован владельцем контракта.
        bool blocked;
        /// @notice Свободные метаданные (JSON, до 512 байт).
        string metadata;
    }

    /// @dev Ключ поддомена — полное имя без ведущей точки: `blog.femboy`.
    mapping(string => Subdomain) private _subdomains;

    event SubdomainRegistered(
        string name,
        string zone,
        string label,
        address indexed owner,
        uint64 expiresAt,
        uint256 timestamp
    );
    event SubdomainTransferred(
        string name,
        address indexed from,
        address indexed to,
        uint256 timestamp
    );
    event SubdomainRenewed(string name, uint64 expiresAt, uint256 timestamp);
    event SubdomainMetadataUpdated(
        string name,
        address indexed owner,
        string metadata,
        uint256 timestamp
    );
    event SubdomainBlocked(string name, string reason, address indexed admin, uint256 timestamp);
    event SubdomainUnblocked(string name, address indexed admin, uint256 timestamp);
    event OwnershipTransferred(address indexed previousOwner, address indexed newOwner);

    error NotOwner();
    error ZeroAddress();
    error InvalidZone(string reason);
    error InvalidLabel(string reason);
    error SubdomainNotFound(string name);
    error SubdomainAlreadyExists(string name);
    error SubdomainIsBlocked(string name);
    error SubdomainBeyondZone(string name);
    error NotAuthorized(address account);
    error MetadataTooLong(uint256 length);

    modifier onlyOwner() {
        if (msg.sender != owner) revert NotOwner();
        _;
    }

    constructor(address registry_, address initialOwner) {
        if (registry_ == address(0) || initialOwner == address(0)) revert ZeroAddress();
        registry = IJustTLDRegistry(registry_);
        owner = initialOwner;
        emit OwnershipTransferred(address(0), initialOwner);
    }

    /* ------------------------------------------------------------------ */
    /*                          USER OPERATIONS                            */
    /* ------------------------------------------------------------------ */

    /**
     * @notice Регистрирует поддомен в своей зоне. Регистрировать может только владелец зоны.
     * @param zone Родительская зона (`.femboy`).
     * @param label Метка поддомена (`blog`), 1–32 символа.
     * @param metadata Метаданные поддомена (до 512 байт, может быть пустой строкой).
     */
    function registerSubdomain(
        string calldata zone,
        string calldata label,
        string calldata metadata
    ) external returns (string memory name) {
        string memory zoneKey = _normalizeZone(zone);
        address zoneOwner = _liveZoneOwner(zoneKey, msg.sender);
        _validateLabel(label);
        if (bytes(metadata).length > MAX_METADATA_LENGTH) {
            revert MetadataTooLong(bytes(metadata).length);
        }

        name = string.concat(_normalizeLabel(label), zoneKey);
        Subdomain storage sub = _subdomains[name];
        if (_isAlive(sub, zoneKey)) revert SubdomainAlreadyExists(name);

        uint64 nowTs = uint64(block.timestamp);
        uint64 zoneExpiresAt = _zoneExpiresAt(zoneKey);
        uint64 expiresAt = nowTs + REGISTRATION_PERIOD;
        if (expiresAt > zoneExpiresAt) expiresAt = zoneExpiresAt;

        _subdomains[name] = Subdomain({
            owner: msg.sender,
            zoneOwner: zoneOwner,
            registeredAt: nowTs,
            expiresAt: expiresAt,
            updatedAt: nowTs,
            blocked: false,
            metadata: metadata
        });

        emit SubdomainRegistered(name, zoneKey, _normalizeLabel(label), msg.sender, expiresAt, nowTs);
    }

    /// @notice Продлевает поддомен (но не дальше срока зоны).
    function renewSubdomain(string calldata zone, string calldata label) external {
        string memory zoneKey = _normalizeZone(zone);
        string memory name = _requireName(zoneKey, label);
        Subdomain storage sub = _requireRights(name, zoneKey);

        uint64 zoneExpiresAt = _zoneExpiresAt(zoneKey);
        uint64 next = sub.expiresAt + REGISTRATION_PERIOD;
        if (next > zoneExpiresAt) next = zoneExpiresAt;
        if (next <= sub.expiresAt) revert SubdomainBeyondZone(name);

        sub.expiresAt = next;
        sub.updatedAt = uint64(block.timestamp);
        emit SubdomainRenewed(name, next, block.timestamp);
    }

    /// @notice Передаёт поддомен другому адресу (владелец поддомена или владелец зоны).
    function transferSubdomain(string calldata zone, string calldata label, address to) external {
        if (to == address(0)) revert ZeroAddress();
        string memory zoneKey = _normalizeZone(zone);
        string memory name = _requireName(zoneKey, label);
        Subdomain storage sub = _requireRights(name, zoneKey);

        address from = sub.owner;
        sub.owner = to;
        sub.updatedAt = uint64(block.timestamp);
        emit SubdomainTransferred(name, from, to, block.timestamp);
    }

    /// @notice Обновляет метаданные поддомена (владелец поддомена или владелец зоны).
    function setSubdomainMetadata(
        string calldata zone,
        string calldata label,
        string calldata metadata
    ) external {
        if (bytes(metadata).length > MAX_METADATA_LENGTH) {
            revert MetadataTooLong(bytes(metadata).length);
        }
        string memory zoneKey = _normalizeZone(zone);
        string memory name = _requireName(zoneKey, label);
        Subdomain storage sub = _requireRights(name, zoneKey);

        sub.metadata = metadata;
        sub.updatedAt = uint64(block.timestamp);
        emit SubdomainMetadataUpdated(name, sub.owner, metadata, block.timestamp);
    }

    /* ------------------------------------------------------------------ */
    /*                          ADMIN OPERATIONS                           */
    /* ------------------------------------------------------------------ */

    /**
     * @notice Блокирует или разблокирует поддомен. Владелец контракта.
     * @param blocked true — заблокировать (фишинг, спам), false — снять блокировку.
     * @param reason Причина блокировки (для истории; при разблокировке можно передать пустую строку).
     */
    function setSubdomainBlocked(
        string calldata zone,
        string calldata label,
        bool blocked,
        string calldata reason
    ) external onlyOwner {
        string memory name = _requireName(_normalizeZone(zone), label);
        Subdomain storage sub = _subdomains[name];
        if (sub.owner == address(0)) revert SubdomainNotFound(name);
        sub.blocked = blocked;
        sub.updatedAt = uint64(block.timestamp);
        if (blocked) {
            emit SubdomainBlocked(name, reason, msg.sender, block.timestamp);
        } else {
            emit SubdomainUnblocked(name, msg.sender, block.timestamp);
        }
    }

    /// @notice Передаёт владение контрактом (например на мультисиг).
    function transferOwnership(address newOwner) external onlyOwner {
        if (newOwner == address(0)) revert ZeroAddress();
        emit OwnershipTransferred(owner, newOwner);
        owner = newOwner;
    }

    /* ------------------------------------------------------------------ */
    /*                                VIEWS                                */
    /* ------------------------------------------------------------------ */

    /// @notice Полные данные поддомена (реверт, если запись не в силе).
    function getSubdomain(string calldata zone, string calldata label) external view returns (Subdomain memory) {
        string memory name = _requireName(_normalizeZone(zone), label);
        return _subdomains[name];
    }

    /// @notice Фактический владелец: 0, если поддомен истёк, заблокирован или зона сменила хозяина.
    function subdomainOwner(string calldata zone, string calldata label) external view returns (address) {
        string memory zoneKey = _normalizeZone(zone);
        Subdomain storage sub = _subdomains[_buildName(zoneKey, label)];
        if (!_isAlive(sub, zoneKey)) return address(0);
        return sub.owner;
    }

    /// @notice Есть ли запись поддомена (включая истёкшие и заблокированные).
    function subdomainExists(string calldata zone, string calldata label) public view returns (bool) {
        return _subdomains[_buildName(_normalizeZone(zone), label)].owner != address(0);
    }

    /// @notice Заблокирован ли поддомен администратором.
    function isSubdomainBlocked(string calldata zone, string calldata label) external view returns (bool) {
        return _subdomains[_buildName(_normalizeZone(zone), label)].blocked;
    }

    /* ------------------------------------------------------------------ */
    /*                              INTERNALS                              */
    /* ------------------------------------------------------------------ */

    /// @dev Зона существует, не заблокирована и не истекла; возвращает её владельца.
    function _liveZoneOwner(string memory zoneKey, address account) private view returns (address zoneOwner) {
        if (!registry.exists(zoneKey)) revert InvalidZone("ZONE_NOT_FOUND");
        if (registry.isBlocked(zoneKey)) revert InvalidZone("ZONE_BLOCKED");
        zoneOwner = registry.ownerOf(zoneKey);
        if (account != zoneOwner) revert NotAuthorized(account);
        if (_zoneExpiresAt(zoneKey) <= block.timestamp) revert InvalidZone("ZONE_EXPIRED");
    }

    /// @dev Срок зоны из реестра.
    function _zoneExpiresAt(string memory zoneKey) private view returns (uint64 expiresAt) {
        return registry.getTLD(zoneKey).expiresAt;
    }

    /// @dev Собирает `label.zone` и требует, чтобы метка была валидной.
    function _requireName(string memory zoneKey, string calldata label) private pure returns (string memory) {
        _validateLabel(label);
        return _buildName(zoneKey, label);
    }

    function _buildName(string memory zoneKey, string calldata label) private pure returns (string memory) {
        return string.concat(_normalizeLabel(label), zoneKey);
    }

    /// @dev Поддомен «в силе»: существует, не заблокирован, не истёк и зона не сменила владельца.
    function _isAlive(Subdomain storage sub, string memory zoneKey) private view returns (bool) {
        if (sub.owner == address(0) || sub.blocked) return false;
        if (sub.expiresAt <= block.timestamp) return false;
        if (!registry.exists(zoneKey)) return false;
        return registry.ownerOf(zoneKey) == sub.zoneOwner;
    }

    /// @dev Проверяет, что вызывающий вправе менять поддомен, и что поддомен в силе.
    function _requireRights(
        string memory name,
        string memory zoneKey
    ) private view returns (Subdomain storage sub) {
        sub = _subdomains[name];
        if (sub.owner == address(0)) revert SubdomainNotFound(name);
        if (sub.blocked) revert SubdomainIsBlocked(name);
        if (sub.expiresAt <= block.timestamp) revert SubdomainNotFound(name);
        bool isZoneOwner = registry.exists(zoneKey) && registry.ownerOf(zoneKey) == msg.sender;
        if (msg.sender != sub.owner && !isZoneOwner) revert NotAuthorized(msg.sender);
        if (!isZoneOwner && registry.ownerOf(zoneKey) != sub.zoneOwner) revert SubdomainNotFound(name);
    }

    /// @dev Метка: 1–32 символа, только a-z/0-9/-, без дефисов по краям и без `--`.
    ///      Верхний регистр допускается — метка нормализуется до проверки.
    function _tryValidateLabel(string memory label) private pure returns (bool ok, string memory reason) {
        bytes memory raw = bytes(_normalizeLabel(label));
        if (raw.length < MIN_LABEL_LENGTH || raw.length > MAX_LABEL_LENGTH) return (false, "LABEL_LENGTH");
        for (uint256 i = 0; i < raw.length; i++) {
            bytes1 char = raw[i];
            bool alnum = (char >= "a" && char <= "z") || (char >= "0" && char <= "9");
            if (!alnum && char != "-") return (false, "LABEL_INVALID_CHARACTER");
        }
        if (raw[0] == "-" || raw[raw.length - 1] == "-") return (false, "LABEL_HYPHEN_EDGE");
        for (uint256 i = 0; i < raw.length - 1; i++) {
            if (raw[i] == "-" && raw[i + 1] == "-") return (false, "LABEL_DOUBLE_HYPHEN");
        }
        return (true, "");
    }

    function _validateLabel(string calldata label) private pure {
        (bool ok, string memory reason) = _tryValidateLabel(label);
        if (!ok) revert InvalidLabel(reason);
    }

    /// @dev Приводит метку к нижнему регистру (валидность уже проверена).
    function _normalizeLabel(string memory label) private pure returns (string memory) {
        bytes memory out = bytes(label);
        for (uint256 i = 0; i < out.length; i++) {
            bytes1 char = out[i];
            if (char >= "A" && char <= "Z") out[i] = bytes1(uint8(char) + 32);
        }
        return string(out);
    }

    /// @dev Приводит зону к каноническому ключу `.name` в нижнем регистре (формат проверяет реестр).
    function _normalizeZone(string calldata zone) private pure returns (string memory) {
        bytes calldata raw = bytes(zone);
        bool hasDot = raw.length > 0 && raw[0] == ".";
        bytes memory out = new bytes(raw.length + (hasDot ? 0 : 1));
        uint256 cursor;
        if (!hasDot) out[cursor++] = ".";
        for (uint256 i = 0; i < raw.length; i++) {
            bytes1 char = raw[i];
            if (char >= "A" && char <= "Z") char = bytes1(uint8(char) + 32);
            out[cursor++] = char;
        }
        return string(out);
    }
}
