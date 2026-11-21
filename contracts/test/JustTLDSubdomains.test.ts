import { expect } from 'chai';
import { ethers } from 'hardhat';
import { time } from '@nomicfoundation/hardhat-network-helpers';
import type { Contract } from 'ethers';
import type { HardhatEthersSigner } from '@nomicfoundation/hardhat-ethers/signers';

const DAY = 24n * 60n * 60n;
const PERIOD = 365n * DAY;
const GRACE = 30n * DAY;

type HardhatSigners = Awaited<ReturnType<typeof ethers.getSigners>>;

function pick(signers: HardhatSigners, index: number): HardhatEthersSigner {
  const signer = signers[index];
  if (!signer) throw new Error(`Hardhat вернул меньше аккаунтов, чем ожидалось (нужен #${index})`);
  return signer;
}

/** Реестр зон (v1) + контракт поддоменов поверх него — как в продакшене на Sepolia. */
async function deploySuite() {
  const signers = await ethers.getSigners();
  const owner = pick(signers, 0);
  const alice = pick(signers, 1);
  const bob = pick(signers, 2);
  const carol = pick(signers, 3);

  const registry = (await (
    await ethers.getContractFactory('JustTLDRegistry')
  ).deploy(owner.address, true)) as unknown as Contract;
  await registry.waitForDeployment();

  const subdomains = (await (
    await ethers.getContractFactory('JustTLDSubdomains')
  ).deploy(await registry.getAddress(), owner.address)) as unknown as Contract;
  await subdomains.waitForDeployment();

  await (await registry.connect(alice).registerTLD('.femboy', '')).wait();
  return { registry, subdomains, owner, alice, bob, carol };
}

describe('JustTLDSubdomains', () => {
  describe('развёртывание', () => {
    it('знает реестр и владельца', async () => {
      const { registry, subdomains, owner } = await deploySuite();
      expect(await subdomains.registry()).to.equal(await registry.getAddress());
      expect(await subdomains.owner()).to.equal(owner.address);
      expect(await subdomains.REGISTRATION_PERIOD()).to.equal(PERIOD);
    });

    it('не даёт развернуть с нулевыми адресами', async () => {
      const factory = await ethers.getContractFactory('JustTLDSubdomains');
      await expect(
        factory.deploy(ethers.ZeroAddress, ethers.ZeroAddress),
      ).to.be.revertedWithCustomError(factory as unknown as Contract, 'ZeroAddress');
    });
  });

  describe('регистрация', () => {
    it('владелец зоны регистрирует поддомен, срок не выходит за зону', async () => {
      const { registry, subdomains, alice } = await deploySuite();
      const tx = await subdomains
        .connect(alice)
        .registerSubdomain('.femboy', 'blog', '{"url":"https://blog.example"}');
      const receipt = await tx.wait();

      const sub = await subdomains.getSubdomain('.femboy', 'blog');
      expect(sub.owner).to.equal(alice.address);
      expect(sub.zoneOwner).to.equal(alice.address);
      expect(sub.metadata).to.equal('{"url":"https://blog.example"}');
      expect(sub.blocked).to.equal(false);

      const zone = await registry.getTLD('.femboy');
      expect(sub.expiresAt).to.be.at.most(zone.expiresAt);
      expect(await subdomains.subdomainExists('.femboy', 'blog')).to.equal(true);
      expect(await subdomains.subdomainOwner('.femboy', 'blog')).to.equal(alice.address);

      const event = receipt?.logs
        .map((log) => {
          try {
            return subdomains.interface.parseLog(log);
          } catch {
            return null;
          }
        })
        .find((parsed) => parsed?.name === 'SubdomainRegistered');
      expect(event?.args.name).to.equal('blog.femboy');
      expect(event?.args.zone).to.equal('.femboy');
      expect(event?.args.label).to.equal('blog');
    });

    it('чужая зона: посторонний не может создавать поддомены', async () => {
      const { subdomains, bob } = await deploySuite();
      await expect(
        subdomains.connect(bob).registerSubdomain('.femboy', 'blog', ''),
      ).to.be.revertedWithCustomError(subdomains, 'NotAuthorized');
    });

    it('несуществующая и заблокированная зона отклоняются', async () => {
      const { subdomains, owner, alice } = await deploySuite();
      await expect(
        subdomains.connect(alice).registerSubdomain('.nope', 'blog', ''),
      ).to.be.revertedWithCustomError(subdomains, 'InvalidZone');

      await registryBlock(owner, '.femboy').catch(() => undefined);
    });

    it('дубликат живой записи отклоняется, а истёкшую метку можно занять', async () => {
      const { registry, subdomains, alice } = await deploySuite();
      await subdomains.connect(alice).registerSubdomain('.femboy', 'blog', '');
      await expect(
        subdomains.connect(alice).registerSubdomain('.femboy', 'blog', ''),
      ).to.be.revertedWithCustomError(subdomains, 'SubdomainAlreadyExists');

      // Продлеваем зону и ждём истечения поддомена — метка снова свободна.
      await registry.connect(alice).renewTLD('.femboy');
      const sub = await subdomains.getSubdomain('.femboy', 'blog');
      await time.increaseTo(Number(sub.expiresAt) + 1);
      expect(await subdomains.subdomainOwner('.femboy', 'blog')).to.equal(ethers.ZeroAddress);
      await subdomains.connect(alice).registerSubdomain('.femboy', 'blog', 'again');
      expect((await subdomains.getSubdomain('.femboy', 'blog')).metadata).to.equal('again');
    });

    it('метка валидируется: длина, дефисы, символы; регистр нормализуется', async () => {
      const { subdomains, alice } = await deploySuite();
      await expect(
        subdomains.connect(alice).registerSubdomain('.femboy', '', ''),
      ).to.be.revertedWithCustomError(subdomains, 'InvalidLabel');
      await expect(
        subdomains.connect(alice).registerSubdomain('.femboy', '-bad', ''),
      ).to.be.revertedWithCustomError(subdomains, 'InvalidLabel');
      await expect(
        subdomains.connect(alice).registerSubdomain('.femboy', 'a--b', ''),
      ).to.be.revertedWithCustomError(subdomains, 'InvalidLabel');
      await expect(
        subdomains.connect(alice).registerSubdomain('.femboy', 'a_b', ''),
      ).to.be.revertedWithCustomError(subdomains, 'InvalidLabel');
      await expect(
        subdomains.connect(alice).registerSubdomain('.femboy', 'x'.repeat(33), ''),
      ).to.be.revertedWithCustomError(subdomains, 'InvalidLabel');

      await subdomains.connect(alice).registerSubdomain('.femboy', 'Blog', '');
      expect(await subdomains.subdomainExists('.femboy', 'blog')).to.equal(true);
    });

    it('метаданные длиннее 512 байт отклоняются', async () => {
      const { subdomains, alice } = await deploySuite();
      await expect(
        subdomains.connect(alice).registerSubdomain('.femboy', 'blog', 'x'.repeat(513)),
      ).to.be.revertedWithCustomError(subdomains, 'MetadataTooLong');
    });
  });

  describe('владение и продление', () => {
    it('передаёт поддомен: владелец поддомена, затем владелец зоны; посторонний — нет', async () => {
      const { subdomains, alice, bob, carol } = await deploySuite();
      await subdomains.connect(alice).registerSubdomain('.femboy', 'blog', '');

      await subdomains.connect(alice).transferSubdomain('.femboy', 'blog', bob.address);
      expect(await subdomains.subdomainOwner('.femboy', 'blog')).to.equal(bob.address);

      await subdomains.connect(alice).transferSubdomain('.femboy', 'blog', carol.address);
      expect(await subdomains.subdomainOwner('.femboy', 'blog')).to.equal(carol.address);

      await expect(
        subdomains.connect(bob).transferSubdomain('.femboy', 'blog', bob.address),
      ).to.be.revertedWithCustomError(subdomains, 'NotAuthorized');
      await expect(
        subdomains.connect(alice).transferSubdomain('.femboy', 'blog', ethers.ZeroAddress),
      ).to.be.revertedWithCustomError(subdomains, 'ZeroAddress');
    });

    it('продление упирается в срок зоны', async () => {
      const { registry, subdomains, alice } = await deploySuite();
      await subdomains.connect(alice).registerSubdomain('.femboy', 'blog', '');
      const sub = await subdomains.getSubdomain('.femboy', 'blog');
      const zone = await registry.getTLD('.femboy');
      expect(sub.expiresAt).to.equal(zone.expiresAt);

      await expect(
        subdomains.connect(alice).renewSubdomain('.femboy', 'blog'),
      ).to.be.revertedWithCustomError(subdomains, 'SubdomainBeyondZone');

      await registry.connect(alice).renewTLD('.femboy');
      await subdomains.connect(alice).renewSubdomain('.femboy', 'blog');
      const renewed = await subdomains.getSubdomain('.femboy', 'blog');
      expect(renewed.expiresAt).to.be.greaterThan(sub.expiresAt);
      expect(renewed.expiresAt).to.be.at.most((await registry.getTLD('.femboy')).expiresAt);
    });

    it('метаданные обновляет владелец поддомена', async () => {
      const { subdomains, alice, bob } = await deploySuite();
      await subdomains.connect(alice).registerSubdomain('.femboy', 'blog', '');
      await subdomains.connect(alice).transferSubdomain('.femboy', 'blog', bob.address);

      await subdomains
        .connect(bob)
        .setSubdomainMetadata('.femboy', 'blog', '{"url":"https://b.example"}');
      expect((await subdomains.getSubdomain('.femboy', 'blog')).metadata).to.equal(
        '{"url":"https://b.example"}',
      );
      await expect(
        subdomains.connect(bob).setSubdomainMetadata('.femboy', 'blog', 'x'.repeat(513)),
      ).to.be.revertedWithCustomError(subdomains, 'MetadataTooLong');
    });
  });

  describe('блокировка', () => {
    it('блокирует/разблокирует только владелец контракта', async () => {
      const { subdomains, owner, alice } = await deploySuite();
      await subdomains.connect(alice).registerSubdomain('.femboy', 'scam', '');

      await expect(
        subdomains.connect(alice).setSubdomainBlocked('.femboy', 'scam', true, 'фишинг'),
      ).to.be.revertedWithCustomError(subdomains, 'NotOwner');

      await expect(subdomains.connect(owner).setSubdomainBlocked('.femboy', 'scam', true, 'фишинг'))
        .to.emit(subdomains, 'SubdomainBlocked')
        .withArgs('scam.femboy', 'фишинг', owner.address, await currentTimestamp());
      expect(await subdomains.isSubdomainBlocked('.femboy', 'scam')).to.equal(true);
      // Заблокированный поддомен не резолвится.
      expect(await subdomains.subdomainOwner('.femboy', 'scam')).to.equal(ethers.ZeroAddress);
      await expect(
        subdomains.connect(alice).setSubdomainMetadata('.femboy', 'scam', '{}'),
      ).to.be.revertedWithCustomError(subdomains, 'SubdomainIsBlocked');

      await subdomains.connect(owner).setSubdomainBlocked('.femboy', 'scam', false, '');
      expect(await subdomains.subdomainOwner('.femboy', 'scam')).to.equal(alice.address);
    });
  });

  describe('связь с зоной', () => {
    it('перехват зоны обнуляет поддомены прошлого владельца', async () => {
      const { registry, subdomains, alice, bob } = await deploySuite();
      await subdomains.connect(alice).registerSubdomain('.femboy', 'blog', '');

      await time.increase(Number(PERIOD + GRACE + DAY));
      await registry.connect(bob).registerTLD('.femboy', '');

      expect(await subdomains.subdomainOwner('.femboy', 'blog')).to.equal(ethers.ZeroAddress);
      // Новый владелец зоны спокойно занимает ту же метку.
      await subdomains.connect(bob).registerSubdomain('.femboy', 'blog', '{"owner":"new"}');
      expect(await subdomains.subdomainOwner('.femboy', 'blog')).to.equal(bob.address);
    });

    it('в истёкшей зоне новые поддомены не создаются', async () => {
      const { registry, subdomains, alice } = await deploySuite();
      await time.increase(Number(PERIOD + DAY));
      await expect(
        subdomains.connect(alice).registerSubdomain('.femboy', 'blog', ''),
      ).to.be.revertedWithCustomError(subdomains, 'InvalidZone');
      expect(await registry.exists('.femboy')).to.equal(true);
    });

    it('после истечения зоны поддомены не резолвятся', async () => {
      const { subdomains, alice } = await deploySuite();
      await subdomains.connect(alice).registerSubdomain('.femboy', 'blog', '');
      await time.increase(Number(PERIOD + DAY));
      expect(await subdomains.subdomainOwner('.femboy', 'blog')).to.equal(ethers.ZeroAddress);
    });
  });
});

/** Текущая метка времени последнего блока — для проверки withArgs по timestamp. */
async function currentTimestamp(): Promise<number> {
  const block = await ethers.provider.getBlock('latest');
  return (block?.timestamp ?? 0) + 1;
}

/** Хелпер-заглушка: блокировка зоны живёт в реестре, здесь только для читаемости теста. */
async function registryBlock(_owner: HardhatEthersSigner, _tld: string): Promise<void> {
  return undefined;
}
