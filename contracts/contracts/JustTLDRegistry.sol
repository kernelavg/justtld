// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {Pausable} from "@openzeppelin/contracts/utils/Pausable.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

/**
 * @title JustTLDRegistry
 * @author JustTLD
 * @notice Децентрализованный реестр пользовательских TLD-зон (например `.myzone`, `.web3`, `.cool`).
 *
 * @dev Модель владения:
 *      - зона регистрируется на адрес отправителя транзакции (`msg.sender`) и становится его собственностью;
 *      - повторная регистрация существующей зоны запрещена (кроме reclaim истёкшей зоны, см. {allowReclaim});
 *      - передача, продление и изменение метаданных доступны только текущему владельцу зоны;
 *      - заблокированную зону нельзя передать, продлить или изменить;
 *      - owner контракта может блокировать/разблокировать зоны и приостанавливать мутации (Pausable).
 *
 *      Контракт не хранит и не переводит средства: единственная стоимость операций — gas.
 */
contract JustTLDRegistry is Ownable, Pausable, ReentrancyGuard {
    /// @notice Структура зоны, хранимая в реестре.
    /// @param owner Адрес текущего владельца зоны.
    /// @param registeredAt Время первой регистрации (Unix timestamp, секунды).
    /// @param expiresAt Время истечения текущего оплаченного срока.
    /// @param updatedAt Время последней мутации зоны.
    /// @param blocked Признак блокировки владельцем контракта.
    /// @param metadata Произвольные метаданные (URI или JSON, до {MAX_METADATA_LENGTH} байт).
    struct Zone {
        address owner;
        uint64 registeredAt;
        uint64 expiresAt;
        uint64 updatedAt;
        bool blocked;
        string metadata;
    }

    /// @notice Срок, который добавляется при регистрации и при каждом продлении (365 дней).
    uint64 public constant REGISTRATION_PERIOD = 365 days;

    /// @notice Грейс-период после истечения, в течение которого зона не может быть перехвачена.
    uint64 public constant GRACE_PERIOD = 30 days;

    /// @notice Минимальная длина зоны вместе с точкой (".ab" — 3 символа).
    uint256 public constant MIN_TLD_LENGTH = 3;

    /// @notice Максимальная длина зоны вместе с точкой (".abcdefghijklmnopqrstu" — 22 символа).
    uint256 public constant MAX_TLD_LENGTH = 21;

    /// @notice Максимальная длина метаданных в байтах.
    uint256 public constant MAX_METADATA_LENGTH = 512;

    /// @notice Максимальная длина причины блокировки в байтах.
    uint256 public constant MAX_REASON_LENGTH = 256;

    /// @notice Максимальная длина слова чёрного списка в байтах.
    uint256 public constant MAX_BLACKLIST_WORD_LENGTH = 32;

    /// @notice Разрешён ли перехват (reclaim) истёкших зон после грейс-периода.
    bool public allowReclaim;

    /// @dev tld => Zone. Ключ нормализован: lower-case и начинается с точки.
    mapping(string => Zone) private _zones;

    /// @dev tld => позиция в массиве {_allTlds} (1-based, 0 = отсутствует).
    mapping(string => uint256) private _indexOf;

    /// @dev Полный список зарегистрированных зон (для пагинации и totalZones()).
    string[] private _allTlds;

    /// @dev tld => зарезервирована (настраиваемый список).
    mapping(string => bool) private _reserved;

    /// @dev слово чёрного списка (lower-case) => запрещено.
    mapping(string => bool) private _blacklist;

    /// @dev Дополнительные зарезервированные зоны (настраиваемые), для UI/аудита.
    string[] private _reservedList;

    /// @dev Слова чёрного списка (настраиваемые), для UI/аудита.
    string[] private _blacklistList;

    /* ------------------------------------------------------------------ */
    /*                              EVENTS                                */
    /* ------------------------------------------------------------------ */

    /// @notice Зона зарегистрирована (или перехвачена после истечения).
    event TLDRegistered(
        string tld,
        address indexed owner,
        uint64 expiresAt,
        string metadata,
        uint64 timestamp
    );

    /// @notice Зона передана другому владельцу.
    event TLDTransferred(string tld, address indexed from, address indexed to, uint64 timestamp);

    /// @notice Срок действия зоны продлён.
    event TLDRenewed(string tld, address indexed owner, uint64 newExpiresAt, uint64 timestamp);

    /// @notice Метаданные зоны обновлены.
    event TLDMetadataUpdated(string tld, address indexed owner, string metadata, uint64 timestamp);

    /// @notice Зона заблокирована владельцем контракта.
    event TLDBlocked(string tld, string reason, address indexed by, uint64 timestamp);

    /// @notice Зона разблокирована владельцем контракта.
    event TLDUnblocked(string tld, address by, uint64 timestamp);

    /// @notice Зона добавлена в настраиваемый список зарезервированных.
    event ReservedTLDAdded(string tld, uint64 timestamp);

    /// @notice Зона удалена из настраиваемого списка зарезервированных.
    event ReservedTLDRemoved(string tld, uint64 timestamp);

    /// @notice Слово добавлено в чёрный список.
    event BlacklistWordAdded(string word, uint64 timestamp);

    /// @notice Слово удалено из чёрного списка.
    event BlacklistWordRemoved(string word, uint64 timestamp);

    /// @notice Изменён режим перехвата истёкших зон.
    event AllowReclaimUpdated(bool allow, uint64 timestamp);

    /* ------------------------------------------------------------------ */
    /*                            CUSTOM ERRORS                           */
    /* ------------------------------------------------------------------ */

    /// @notice Нарушен формат зоны или иная проверка валидации.
    error InvalidTLD(string reason);

    /// @notice Зона уже зарегистрирована (повторная регистрация запрещена).
    error TLDAlreadyExists(string tld);

    /// @notice Зона не найдена в реестре.
    error TLDNotFound(string tld);

    /// @notice Отправитель не является владельцем зоны.
    error NotTLDOwner(string tld, address caller);

    /// @notice Зона заблокирована: передача/продление/изменение запрещены.
    error TLDIsBlocked(string tld);

    /// @notice Зона находится во встроенном или настраиваемом списке резервов.
    error TLDReserved(string tld);

    /// @notice Зона содержит запрещённое слово.
    error TLDBlacklisted(string tld);

    /// @notice Передан нулевой адрес.
    error ZeroAddress();

    /// @notice Новый владелец совпадает с текущим.
    error InvalidNewOwner(address newOwner);

    /// @notice Метаданные длиннее допустимого предела.
    error MetadataTooLong(uint256 length, uint256 max);

    /// @notice Причина блокировки пустая или слишком длинная.
    error InvalidReason();

    /// @notice Зона не заблокирована (для unblockTLD).
    error TLDNotBlocked(string tld);

    /* ------------------------------------------------------------------ */
    /*                            CONSTRUCTOR                             */
    /* ------------------------------------------------------------------ */

    /**
     * @notice Разворачивает реестр.
     * @param initialOwner Адрес owner контракта (администратор).
     * @param allowReclaim_ Разрешить перехват истёкших зон после {GRACE_PERIOD}.
     */
    constructor(address initialOwner, bool allowReclaim_) Ownable(initialOwner) {
        if (initialOwner == address(0)) revert ZeroAddress();
        allowReclaim = allowReclaim_;
    }

    /* ------------------------------------------------------------------ */
    /*                          USER OPERATIONS                           */
    /* ------------------------------------------------------------------ */

    /**
     * @notice Регистрирует новую зону на адрес отправителя.
     * @dev Проверяет формат, резервы, чёрный список и отсутствие дубля.
     *      Если зона существует, истекла и разрешён reclaim — она переходит отправителю.
     * @param tld Зона в формате `.example` (регистр не важен, приводится к нижнему).
     * @param metadata Метаданные зоны (до {MAX_METADATA_LENGTH} байт, может быть пустой строкой).
     * @return key Нормализованный ключ зоны.
     */
    function registerTLD(
        string calldata tld,
        string calldata metadata
    ) external whenNotPaused nonReentrant returns (string memory key) {
        (key, ) = _validateAndNormalize(tld, true);
        if (bytes(metadata).length > MAX_METADATA_LENGTH) {
            revert MetadataTooLong(bytes(metadata).length, MAX_METADATA_LENGTH);
        }

        Zone storage zone = _zones[key];
        uint64 nowTs = uint64(block.timestamp);
        uint64 newExpiresAt = nowTs + REGISTRATION_PERIOD;

        if (zone.owner != address(0)) {
            if (!_isReclaimable(zone, nowTs)) revert TLDAlreadyExists(key);
            // Перехват истёкшей зоны: срок и владелец сбрасываются, история остаётся в событиях.
            zone.owner = msg.sender;
            zone.registeredAt = nowTs;
            zone.expiresAt = newExpiresAt;
            zone.updatedAt = nowTs;
            zone.blocked = false;
            zone.metadata = metadata;
        } else {
            _zones[key] = Zone({
                owner: msg.sender,
                registeredAt: nowTs,
                expiresAt: newExpiresAt,
                updatedAt: nowTs,
                blocked: false,
                metadata: metadata
            });
            _allTlds.push(key);
            _indexOf[key] = _allTlds.length;
        }

        emit TLDRegistered(key, msg.sender, newExpiresAt, metadata, nowTs);
    }

    /**
     * @notice Передаёт зону новому владельцу.
     * @dev Только текущий владелец. Срок действия и дата регистрации сохраняются.
     * @param tld Зона.
     * @param newOwner Адрес нового владельца (не нулевой, не совпадает с текущим).
     */
    function transferTLD(string calldata tld, address newOwner) external whenNotPaused nonReentrant {
        string memory key = _normalize(tld);
        Zone storage zone = _requireZone(key);
        if (zone.owner != msg.sender) revert NotTLDOwner(key, msg.sender);
        if (zone.blocked) revert TLDIsBlocked(key);
        if (newOwner == address(0)) revert ZeroAddress();
        if (newOwner == zone.owner) revert InvalidNewOwner(newOwner);

        address previousOwner = zone.owner;
        zone.owner = newOwner;
        zone.updatedAt = uint64(block.timestamp);

        emit TLDTransferred(key, previousOwner, newOwner, uint64(block.timestamp));
    }

    /**
     * @notice Продлевает зону на {REGISTRATION_PERIOD} (365 дней).
     * @dev Только владелец. Если зона истекла, новый срок считается от текущего времени,
     *      иначе — от текущей даты истечения (раннее продление не сгорает).
     * @param tld Зона.
     */
    function renewTLD(string calldata tld) external whenNotPaused nonReentrant {
        string memory key = _normalize(tld);
        Zone storage zone = _requireZone(key);
        if (zone.owner != msg.sender) revert NotTLDOwner(key, msg.sender);
        if (zone.blocked) revert TLDIsBlocked(key);

        uint64 nowTs = uint64(block.timestamp);
        uint64 base = zone.expiresAt > nowTs ? zone.expiresAt : nowTs;
        uint64 newExpiresAt = base + REGISTRATION_PERIOD;
        zone.expiresAt = newExpiresAt;
        zone.updatedAt = nowTs;

        emit TLDRenewed(key, msg.sender, newExpiresAt, nowTs);
    }

    /**
     * @notice Обновляет метаданные зоны.
     * @dev Только владелец, зона не должна быть заблокирована.
     * @param tld Зона.
     * @param metadata Новые метаданные (до {MAX_METADATA_LENGTH} байт).
     */
    function setTLDMetadata(
        string calldata tld,
        string calldata metadata
    ) external whenNotPaused nonReentrant {
        string memory key = _normalize(tld);
        Zone storage zone = _requireZone(key);
        if (zone.owner != msg.sender) revert NotTLDOwner(key, msg.sender);
        if (zone.blocked) revert TLDIsBlocked(key);
        if (bytes(metadata).length > MAX_METADATA_LENGTH) {
            revert MetadataTooLong(bytes(metadata).length, MAX_METADATA_LENGTH);
        }

        zone.metadata = metadata;
        zone.updatedAt = uint64(block.timestamp);

        emit TLDMetadataUpdated(key, msg.sender, metadata, uint64(block.timestamp));
    }

    /* ------------------------------------------------------------------ */
    /*                         ADMIN OPERATIONS                           */
    /* ------------------------------------------------------------------ */

    /**
     * @notice Блокирует зону. Заблокированную зону нельзя передать, продлить или изменить.
     * @param tld Зона.
     * @param reason Причина блокировки (1..{MAX_REASON_LENGTH} байт).
     */
    function blockTLD(string calldata tld, string calldata reason) external onlyOwner {
        string memory key = _normalize(tld);
        Zone storage zone = _requireZone(key);
        if (zone.blocked) revert TLDIsBlocked(key);
        uint256 reasonLength = bytes(reason).length;
        if (reasonLength == 0 || reasonLength > MAX_REASON_LENGTH) revert InvalidReason();

        zone.blocked = true;
        zone.updatedAt = uint64(block.timestamp);

        emit TLDBlocked(key, reason, msg.sender, uint64(block.timestamp));
    }

    /**
     * @notice Разблокирует зону.
     * @param tld Зона.
     */
    function unblockTLD(string calldata tld) external onlyOwner {
        string memory key = _normalize(tld);
        Zone storage zone = _requireZone(key);
        if (!zone.blocked) revert TLDNotBlocked(key);

        zone.blocked = false;
        zone.updatedAt = uint64(block.timestamp);

        emit TLDUnblocked(key, msg.sender, uint64(block.timestamp));
    }

    /// @notice Приостанавливает регистрацию/передачу/продление/изменение метаданных.
    function pause() public onlyOwner {
        _pause();
    }

    /// @notice Возобновляет мутации после паузы.
    function unpause() public onlyOwner {
        _unpause();
    }

    /**
     * @notice Включает или выключает перехват истёкших зон после {GRACE_PERIOD}.
     * @param allow Новое значение флага.
     */
    function setAllowReclaim(bool allow) external onlyOwner {
        allowReclaim = allow;
        emit AllowReclaimUpdated(allow, uint64(block.timestamp));
    }

    /**
     * @notice Добавляет зону в настраиваемый список зарезервированных.
     * @param tld Зона в формате `.example`.
     */
    function addReservedTLD(string calldata tld) external onlyOwner {
        (string memory key, ) = _validateAndNormalize(tld, false);
        if (_reserved[key]) revert TLDReserved(key);
        _reserved[key] = true;
        _reservedList.push(key);
        emit ReservedTLDAdded(key, uint64(block.timestamp));
    }

    /**
     * @notice Удаляет зону из настраиваемого списка зарезервированных.
     * @param tld Зона в формате `.example`.
     */
    function removeReservedTLD(string calldata tld) external onlyOwner {
        string memory key = _normalize(tld);
        if (!_reserved[key]) revert TLDReserved(key);
        _reserved[key] = false;
        uint256 length = _reservedList.length;
        for (uint256 i = 0; i < length; i++) {
            if (keccak256(bytes(_reservedList[i])) == keccak256(bytes(key))) {
                _reservedList[i] = _reservedList[length - 1];
                _reservedList.pop();
                break;
            }
        }
        emit ReservedTLDRemoved(key, uint64(block.timestamp));
    }

    /**
     * @notice Добавляет слово в чёрный список (проверяется как подстрока зоны).
     * @param word Слово в нижнем регистре, латиница/цифры/дефис (2..{MAX_BLACKLIST_WORD_LENGTH}).
     */
    function addBlacklistedWord(string calldata word) external onlyOwner {
        string memory normalized = _normalizeWord(word);
        if (_blacklist[normalized]) revert TLDBlacklisted(normalized);
        _blacklist[normalized] = true;
        _blacklistList.push(normalized);
        emit BlacklistWordAdded(normalized, uint64(block.timestamp));
    }

    /**
     * @notice Удаляет слово из чёрного списка.
     * @param word Слово, ранее добавленное в чёрный список.
     */
    function removeBlacklistedWord(string calldata word) external onlyOwner {
        string memory normalized = _normalizeWord(word);
        if (!_blacklist[normalized]) revert TLDBlacklisted(normalized);
        _blacklist[normalized] = false;
        uint256 length = _blacklistList.length;
        for (uint256 i = 0; i < length; i++) {
            if (keccak256(bytes(_blacklistList[i])) == keccak256(bytes(normalized))) {
                _blacklistList[i] = _blacklistList[length - 1];
                _blacklistList.pop();
                break;
            }
        }
        emit BlacklistWordRemoved(normalized, uint64(block.timestamp));
    }

    /* ------------------------------------------------------------------ */
    /*                              VIEWS                                 */
    /* ------------------------------------------------------------------ */

    /**
     * @notice Возвращает полную информацию о зоне.
     * @param tld Зона.
     * @return zone Структура зоны.
     */
    function getTLD(string calldata tld) external view returns (Zone memory zone) {
        zone = _requireZoneView(_normalize(tld));
    }

    /**
     * @notice Возвращает адрес владельца зоны.
     * @param tld Зона.
     */
    function ownerOf(string calldata tld) external view returns (address) {
        return _requireZoneView(_normalize(tld)).owner;
    }

    /// @notice Существует ли зона в реестре (true и для истёкших, и для заблокированных).
    function exists(string calldata tld) public view returns (bool) {
        return _zones[_normalize(tld)].owner != address(0);
    }

    /// @notice Общее количество когда-либо зарегистрированных зон.
    function totalZones() external view returns (uint256) {
        return _allTlds.length;
    }

    /// @notice Истёк ли срок действия зоны.
    function isExpired(string calldata tld) public view returns (bool) {
        Zone storage zone = _zones[_normalize(tld)];
        return zone.owner != address(0) && zone.expiresAt <= block.timestamp;
    }

    /// @notice Заблокирована ли зона.
    function isBlocked(string calldata tld) public view returns (bool) {
        return _zones[_normalize(tld)].blocked;
    }

    /// @notice Можно ли перехватить истёкшую зону (reclaim) прямо сейчас.
    function isReclaimable(string calldata tld) external view returns (bool) {
        return _isReclaimable(_zones[_normalize(tld)], uint64(block.timestamp));
    }

    /// @notice Возвращает зоны владельца (для личного кабинета).
    /// @param account Адрес владельца.
    function tldsOfOwner(address account) external view returns (string[] memory result) {
        uint256 length = _allTlds.length;
        uint256 count;
        for (uint256 i = 0; i < length; i++) {
            if (_zones[_allTlds[i]].owner == account) count++;
        }
        result = new string[](count);
        uint256 cursor;
        for (uint256 i = 0; i < length; i++) {
            string memory key = _allTlds[i];
            if (_zones[key].owner == account) {
                result[cursor] = key;
                cursor++;
            }
        }
    }

    /// @notice Постраничный список всех зон.
    /// @param offset Смещение (0-based).
    /// @param limit Максимальное количество записей.
    function allTLDs(uint256 offset, uint256 limit) external view returns (string[] memory page) {
        uint256 length = _allTlds.length;
        if (offset >= length || limit == 0) return new string[](0);
        uint256 end = offset + limit;
        if (end > length) end = length;
        page = new string[](end - offset);
        for (uint256 i = offset; i < end; i++) {
            page[i - offset] = _allTlds[i];
        }
    }

    /// @notice Список настраиваемых зарезервированных зон.
    function reservedTLDs() external view returns (string[] memory) {
        return _reservedList;
    }

    /// @notice Список слов чёрного списка.
    function blacklistedWords() external view returns (string[] memory) {
        return _blacklistList;
    }

    /// @notice Встроенный список зарезервированных зон.
    function builtinReservedTLDs() external pure returns (string[] memory) {
        string[] memory list = new string[](10);
        list[0] = ".eth";
        list[1] = ".com";
        list[2] = ".net";
        list[3] = ".org";
        list[4] = ".gov";
        list[5] = ".edu";
        list[6] = ".io";
        list[7] = ".ai";
        list[8] = ".sol";
        list[9] = ".local";
        return list;
    }

    /**
     * @notice Полная проверка возможности регистрации (для UI и API).
     * @param tld Предполагаемая зона.
     * @return ok true, если зону можно зарегистрировать прямо сейчас.
     * @return reason Причина отказа (пустая строка при ok).
     */
    function checkRegistration(string calldata tld) external view returns (bool ok, string memory reason) {
        (bool formatOk, string memory formatReason, string memory key, ) = _tryNormalize(tld);
        if (!formatOk) return (false, formatReason);
        if (_isBuiltinReserved(key) || _reserved[key]) return (false, "TLD_RESERVED");
        if (_isBlacklisted(key)) return (false, "TLD_BLACKLISTED");
        Zone storage zone = _zones[key];
        if (zone.owner != address(0) && !_isReclaimable(zone, uint64(block.timestamp))) {
            return (false, "TLD_ALREADY_EXISTS");
        }
        if (paused()) return (false, "CONTRACT_PAUSED");
        return (true, "");
    }

    /// @notice Проверка только формата зоны (pure, не зависит от состояния).
    function validateFormat(string calldata tld) external pure returns (bool ok, string memory reason) {
        (ok, reason, , ) = _tryNormalize(tld);
    }

    /* ------------------------------------------------------------------ */
    /*                            INTERNALS                               */
    /* ------------------------------------------------------------------ */

    /// @dev Возвращает зону или реверсит TLDNotFound.
    function _requireZone(string memory key) private view returns (Zone storage zone) {
        zone = _zones[key];
        if (zone.owner == address(0)) revert TLDNotFound(key);
    }

    /// @dev View-версия _requireZone (для внешних view-функций).
    function _requireZoneView(string memory key) private view returns (Zone storage zone) {
        zone = _zones[key];
        if (zone.owner == address(0)) revert TLDNotFound(key);
    }

    /// @dev Проверяет зону целиком (формат + резервы + blacklist) и нормализует ключ.
    function _validateAndNormalize(
        string calldata tld,
        bool checkLists
    ) private view returns (string memory key, string memory label) {
        (
            bool ok,
            string memory reason,
            string memory normalized,
            string memory normalizedLabel
        ) = _tryNormalize(tld);
        if (!ok) revert InvalidTLD(reason);
        if (checkLists) {
            if (_isBuiltinReserved(normalized) || _reserved[normalized]) revert TLDReserved(normalized);
            if (_isBlacklisted(normalized)) revert TLDBlacklisted(normalized);
        }
        return (normalized, normalizedLabel);
    }

    /// @dev Нормализует зону без проверок списков; реверсит InvalidTLD при неверном формате.
    function _normalize(string calldata tld) private pure returns (string memory) {
        (bool ok, string memory reason, string memory normalized, ) = _tryNormalize(tld);
        if (!ok) revert InvalidTLD(reason);
        return normalized;
    }

    /**
     * @dev Ядро валидации. Возвращает нормализованный ключ (lower-case, с точкой) и label без точки.
     *      Правила: начинается с ".", длина 3..21, только [a-z0-9-] в label, без "--",
     *      без дефиса по краям; верхний регистр приводится к нижнему.
     */
    function _tryNormalize(
        string calldata tld
    ) private pure returns (bool ok, string memory reason, string memory key, string memory label) {
        bytes memory raw = bytes(tld);
        uint256 length = raw.length;
        if (length == 0) return (false, "TLD_EMPTY", "", "");
        if (length < MIN_TLD_LENGTH || length > MAX_TLD_LENGTH) {
            return (false, "TLD_LENGTH", "", "");
        }
        if (raw[0] != bytes1(".")) return (false, "TLD_MUST_START_WITH_DOT", "", "");

        bytes memory normalized = new bytes(length);
        normalized[0] = bytes1(".");
        for (uint256 i = 1; i < length; i++) {
            bytes1 char = raw[i];
            if (char >= bytes1("A") && char <= bytes1("Z")) {
                char = bytes1(uint8(char) + 32);
            }
            bool isLower = char >= bytes1("a") && char <= bytes1("z");
            bool isDigit = char >= bytes1("0") && char <= bytes1("9");
            bool isHyphen = char == bytes1("-");
            if (!isLower && !isDigit && !isHyphen) return (false, "TLD_INVALID_CHARACTER", "", "");
            normalized[i] = char;
        }

        if (normalized[1] == bytes1("-") || normalized[length - 1] == bytes1("-")) {
            return (false, "TLD_HYPHEN_EDGE", "", "");
        }
        for (uint256 i = 1; i < length - 1; i++) {
            if (normalized[i] == bytes1("-") && normalized[i + 1] == bytes1("-")) {
                return (false, "TLD_DOUBLE_HYPHEN", "", "");
            }
        }

        bytes memory labelBytes = new bytes(length - 1);
        for (uint256 i = 1; i < length; i++) {
            labelBytes[i - 1] = normalized[i];
        }

        return (true, "", string(normalized), string(labelBytes));
    }

    /// @dev Нормализует слово чёрного списка (lower-case, [a-z0-9-], 2..32).
    function _normalizeWord(string calldata word) private pure returns (string memory) {
        bytes memory raw = bytes(word);
        uint256 length = raw.length;
        if (length < 2 || length > MAX_BLACKLIST_WORD_LENGTH) revert InvalidTLD("BLACKLIST_WORD_LENGTH");
        bytes memory normalized = new bytes(length);
        for (uint256 i = 0; i < length; i++) {
            bytes1 char = raw[i];
            if (char >= bytes1("A") && char <= bytes1("Z")) {
                char = bytes1(uint8(char) + 32);
            }
            bool isLower = char >= bytes1("a") && char <= bytes1("z");
            bool isDigit = char >= bytes1("0") && char <= bytes1("9");
            bool isHyphen = char == bytes1("-");
            if (!isLower && !isDigit && !isHyphen) revert InvalidTLD("INVALID_BLACKLIST_WORD");
            normalized[i] = char;
        }
        return string(normalized);
    }

    /// @dev Встроенный список резервов (политика JustTLD).
    function _isBuiltinReserved(string memory key) private pure returns (bool) {
        bytes32 hash = keccak256(bytes(key));
        return (hash == keccak256(".eth") ||
            hash == keccak256(".com") ||
            hash == keccak256(".net") ||
            hash == keccak256(".org") ||
            hash == keccak256(".gov") ||
            hash == keccak256(".edu") ||
            hash == keccak256(".io") ||
            hash == keccak256(".ai") ||
            hash == keccak256(".sol") ||
            hash == keccak256(".local"));
    }

    /// @dev Проверяет label на наличие любого слова из чёрного списка (подстрока).
    function _isBlacklisted(string memory key) private view returns (bool) {
        uint256 wordsLength = _blacklistList.length;
        if (wordsLength == 0) return false;
        bytes memory keyBytes = bytes(key);
        for (uint256 w = 0; w < wordsLength; w++) {
            bytes memory word = bytes(_blacklistList[w]);
            if (_contains(keyBytes, word)) return true;
        }
        return false;
    }

    /// @dev Проверяет, можно ли перехватить истёкшую зону.
    function _isReclaimable(Zone storage zone, uint64 nowTs) private view returns (bool) {
        return
            allowReclaim &&
            zone.owner != address(0) &&
            !zone.blocked &&
            zone.expiresAt + GRACE_PERIOD < nowTs;
    }

    /// @dev Поиск подстроки в bytes.
    function _contains(bytes memory haystack, bytes memory needle) private pure returns (bool) {
        uint256 needleLength = needle.length;
        if (needleLength == 0 || haystack.length < needleLength) return false;
        for (uint256 i = 0; i <= haystack.length - needleLength; i++) {
            bool matched = true;
            for (uint256 j = 0; j < needleLength; j++) {
                if (haystack[i + j] != needle[j]) {
                    matched = false;
                    break;
                }
            }
            if (matched) return true;
        }
        return false;
    }
}
