import { expect } from 'chai';
import { ethers } from 'hardhat';
import { time } from '@nomicfoundation/hardhat-network-helpers';
import type { Contract, Log } from 'ethers';
import type { HardhatEthersSigner } from '@nomicfoundation/hardhat-ethers/signers';

const DAY = 24n * 60n * 60n;
const PERIOD = 365n * DAY;
const GRACE = 30n * DAY;

type HardhatSigners = Awaited<ReturnType<typeof ethers.getSigners>>;

/** Достаёт signer по индексу: base-tsconfig включает noUncheckedIndexedAccess. */
function pick(signers: HardhatSigners, index: number): HardhatEthersSigner {
  const signer = signers[index];
  if (!signer) throw new Error(`Hardhat вернул меньше аккаунтов, чем ожидалось (нужен #${index})`);
  return signer;
}

async function deployRegistry(allowReclaim = true) {
  const signers = await ethers.getSigners();
  const owner = pick(signers, 0);
  const alice = pick(signers, 1);
  const bob = pick(signers, 2);
  const carol = pick(signers, 3);
  const factory = await ethers.getContractFactory('JustTLDRegistry');
  const registry = (await factory.deploy(owner.address, allowReclaim)) as unknown as Contract;
  await registry.waitForDeployment();
  return { registry, owner, alice, bob, carol };
}

async function register(
  registry: Contract,
  signer: HardhatEthersSigner,
  tld: string,
  metadata = '',
) {
  const tx = await registry.connect(signer).registerTLD(tld, metadata);
  const receipt = await tx.wait();
  return receipt;
}

describe('JustTLDRegistry', () => {
  describe('deployment', () => {
    it('ставит owner и пустой реестр', async () => {
      const { registry, owner } = await deployRegistry();
      expect(await registry.owner()).to.equal(owner.address);
      expect(await registry.totalZones()).to.equal(0n);
      expect(await registry.allowReclaim()).to.equal(true);
      expect(await registry.REGISTRATION_PERIOD()).to.equal(PERIOD);
    });

    it('отказывает при нулевом owner', async () => {
      const factory = await ethers.getContractFactory('JustTLDRegistry');
      await expect(factory.deploy(ethers.ZeroAddress, true)).to.be.revertedWithCustomError(
        factory as unknown as Contract,
        'OwnableInvalidOwner',
      );
    });
  });

  describe('registerTLD — успешные сценарии', () => {
    it('регистрирует валидную зону и делает отправителя владельцем', async () => {
      const { registry, alice } = await deployRegistry();
      await expect(
        registry.connect(alice).registerTLD('.myzone', '{"site":"https://my.zone"}'),
      ).to.emit(registry, 'TLDRegistered');

      expect(await registry.exists('.myzone')).to.equal(true);
      expect(await registry.ownerOf('.myzone')).to.equal(alice.address);
      expect(await registry.totalZones()).to.equal(1n);

      const zone = await registry.getTLD('.myzone');
      expect(zone.owner).to.equal(alice.address);
      expect(zone.metadata).to.equal('{"site":"https://my.zone"}');
      expect(zone.blocked).to.equal(false);
      expect(zone.expiresAt - zone.registeredAt).to.equal(PERIOD);
    });

    it('событие TLDRegistered содержит корректные аргументы', async () => {
      const { registry, alice } = await deployRegistry();
      const tx = registry.connect(alice).registerTLD('.eventzone', 'meta');
      const receipt = await (await tx).wait();
      const block = await ethers.provider.getBlock(receipt!.blockNumber);
      const parsed = receipt!.logs
        .map((log: Log) => {
          try {
            return registry.interface.parseLog(log);
          } catch {
            return null;
          }
        })
        .find((log: { name?: string } | null) => log?.name === 'TLDRegistered');

      expect(parsed).to.not.equal(undefined);
      expect(parsed!.args[0]).to.equal('.eventzone');
      expect(parsed!.args[1]).to.equal(alice.address);
      expect(parsed!.args[2]).to.equal(BigInt(block!.timestamp) + PERIOD);
      expect(parsed!.args[3]).to.equal('meta');
      expect(parsed!.args[4]).to.equal(BigInt(block!.timestamp));
    });

    it('приводит зону к нижнему регистру', async () => {
      const { registry, alice, bob } = await deployRegistry();
      await register(registry, alice, '.MyZone');
      expect(await registry.ownerOf('.myzone')).to.equal(alice.address);
      await expect(registry.connect(bob).registerTLD('.MYZONE', '')).to.be.revertedWithCustomError(
        registry,
        'TLDAlreadyExists',
      );
    });

    it('разрешает цифры и одиночные дефисы', async () => {
      const { registry, alice } = await deployRegistry();
      await register(registry, alice, '.my-zone-2');
      expect(await registry.exists('.my-zone-2')).to.equal(true);
      await register(registry, alice, '.x2y');
      expect(await registry.exists('.x2y')).to.equal(true);
    });
  });

  describe('registerTLD — валидация', () => {
    const invalid: Array<[string, string]> = [
      ['', 'TLD_EMPTY'],
      ['myzone', 'TLD_MUST_START_WITH_DOT'],
      ['.a', 'TLD_LENGTH'],
      ['.abcdefghijklmnopqrstu', 'TLD_LENGTH'],
      ['.my_zone', 'TLD_INVALID_CHARACTER'],
      ['.my zone', 'TLD_INVALID_CHARACTER'],
      ['.зона', 'TLD_INVALID_CHARACTER'],
      ['.-myzone', 'TLD_HYPHEN_EDGE'],
      ['.myzone-', 'TLD_HYPHEN_EDGE'],
      ['.my--zone', 'TLD_DOUBLE_HYPHEN'],
    ];

    for (const [tld, reason] of invalid) {
      it(`отклоняет "${tld}" (${reason})`, async () => {
        const { registry, alice } = await deployRegistry();
        await expect(registry.connect(alice).registerTLD(tld, '')).to.be.revertedWithCustomError(
          registry,
          'InvalidTLD',
        );
        const result = await registry.validateFormat(tld);
        const ok = result[0];
        const errorReason = result[1];
        expect(ok).to.equal(false);
        expect(errorReason).to.equal(reason);
      });
    }

    it('отклоняет встроенные зарезервированные зоны', async () => {
      const { registry, alice } = await deployRegistry();
      for (const tld of ['.eth', '.com', '.net', '.org', '.gov', '.edu', '.io', '.ai', '.sol']) {
        await expect(registry.connect(alice).registerTLD(tld, '')).to.be.revertedWithCustomError(
          registry,
          'TLDReserved',
        );
      }
    });

    it('отклоняет настраиваемые зарезервированные зоны', async () => {
      const { registry, owner, alice } = await deployRegistry();
      await registry.connect(owner).addReservedTLD('.justtld');
      await expect(
        registry.connect(alice).registerTLD('.justtld', ''),
      ).to.be.revertedWithCustomError(registry, 'TLDReserved');
      await registry.connect(owner).removeReservedTLD('.justtld');
      await register(registry, alice, '.justtld');
      expect(await registry.ownerOf('.justtld')).to.equal(alice.address);
    });

    it('только owner управляет списками резервов', async () => {
      const { registry, alice } = await deployRegistry();
      await expect(registry.connect(alice).addReservedTLD('.x1')).to.be.revertedWithCustomError(
        registry,
        'OwnableUnauthorizedAccount',
      );
    });

    it('отклоняет оскорбительные/опасные имена из чёрного списка', async () => {
      const { registry, owner, alice } = await deployRegistry();
      await registry.connect(owner).addBlacklistedWord('scam');
      await expect(
        registry.connect(alice).registerTLD('.scamzone', ''),
      ).to.be.revertedWithCustomError(registry, 'TLDBlacklisted');
      await registry.connect(owner).removeBlacklistedWord('scam');
      await register(registry, alice, '.scamzone');
      expect(await registry.exists('.scamzone')).to.equal(true);
    });

    it('отклоняет повторную регистрацию активной зоны', async () => {
      const { registry, alice, bob } = await deployRegistry();
      await register(registry, alice, '.taken');
      await expect(registry.connect(bob).registerTLD('.taken', '')).to.be.revertedWithCustomError(
        registry,
        'TLDAlreadyExists',
      );
      await expect(registry.connect(alice).registerTLD('.taken', '')).to.be.revertedWithCustomError(
        registry,
        'TLDAlreadyExists',
      );
    });

    it('отклоняет слишком длинные метаданные', async () => {
      const { registry, alice } = await deployRegistry();
      await expect(
        registry.connect(alice).registerTLD('.metalimit', 'x'.repeat(513)),
      ).to.be.revertedWithCustomError(registry, 'MetadataTooLong');
      await register(registry, alice, '.metalimit', 'x'.repeat(512));
    });

    it('checkRegistration отдаёт причину отказа', async () => {
      const { registry, owner, alice } = await deployRegistry();
      const free = await registry.checkRegistration('.free');
      expect(free[0]).to.equal(true);
      expect(free[1]).to.equal('');
      await register(registry, alice, '.taken2');
      const taken = await registry.checkRegistration('.taken2');
      expect(taken[0]).to.equal(false);
      expect(taken[1]).to.equal('TLD_ALREADY_EXISTS');
      const reserved = await registry.checkRegistration('.com');
      expect(reserved[0]).to.equal(false);
      expect(reserved[1]).to.equal('TLD_RESERVED');
      const noDot = await registry.checkRegistration('oops');
      expect(noDot[0]).to.equal(false);
      expect(noDot[1]).to.equal('TLD_MUST_START_WITH_DOT');
      await registry.connect(owner).pause();
      const paused = await registry.checkRegistration('.another');
      expect(paused[0]).to.equal(false);
      expect(paused[1]).to.equal('CONTRACT_PAUSED');
    });
  });

  describe('transferTLD', () => {
    it('передаёт зону владельцем и сохраняет срок', async () => {
      const { registry, alice, bob } = await deployRegistry();
      await register(registry, alice, '.t1');
      const before = await registry.getTLD('.t1');
      await expect(registry.connect(alice).transferTLD('.t1', bob.address))
        .to.emit(registry, 'TLDTransferred')
        .withArgs('.t1', alice.address, bob.address, anyUint());
      const after = await registry.getTLD('.t1');
      expect(after.owner).to.equal(bob.address);
      expect(after.registeredAt).to.equal(before.registeredAt);
      expect(after.expiresAt).to.equal(before.expiresAt);
    });

    it('отклоняет передачу не-владельцем', async () => {
      const { registry, alice, bob, carol } = await deployRegistry();
      await register(registry, alice, '.t2');
      await expect(
        registry.connect(bob).transferTLD('.t2', carol.address),
      ).to.be.revertedWithCustomError(registry, 'NotTLDOwner');
    });

    it('отклоняет передачу на нулевой адрес и самому себе', async () => {
      const { registry, alice } = await deployRegistry();
      await register(registry, alice, '.t3');
      await expect(
        registry.connect(alice).transferTLD('.t3', ethers.ZeroAddress),
      ).to.be.revertedWithCustomError(registry, 'ZeroAddress');
      await expect(
        registry.connect(alice).transferTLD('.t3', alice.address),
      ).to.be.revertedWithCustomError(registry, 'InvalidNewOwner');
    });

    it('отклоняет передачу несуществующей зоны', async () => {
      const { registry, alice, bob } = await deployRegistry();
      await expect(
        registry.connect(alice).transferTLD('.ghost', bob.address),
      ).to.be.revertedWithCustomError(registry, 'TLDNotFound');
    });

    it('отклоняет передачу заблокированной зоны', async () => {
      const { registry, owner, alice, bob } = await deployRegistry();
      await register(registry, alice, '.t4');
      await registry.connect(owner).blockTLD('.t4', 'abuse');
      await expect(
        registry.connect(alice).transferTLD('.t4', bob.address),
      ).to.be.revertedWithCustomError(registry, 'TLDIsBlocked');
    });
  });

  describe('renewTLD', () => {
    it('продлевает на 365 дней (владелец)', async () => {
      const { registry, alice } = await deployRegistry();
      await register(registry, alice, '.r1');
      const before = await registry.getTLD('.r1');
      await expect(registry.connect(alice).renewTLD('.r1')).to.emit(registry, 'TLDRenewed');
      const after = await registry.getTLD('.r1');
      expect(after.expiresAt).to.equal(before.expiresAt + PERIOD);
    });

    it('отклоняет продление чужой зоны', async () => {
      const { registry, alice, bob } = await deployRegistry();
      await register(registry, alice, '.r2');
      await expect(registry.connect(bob).renewTLD('.r2')).to.be.revertedWithCustomError(
        registry,
        'NotTLDOwner',
      );
    });

    it('отклоняет продление заблокированной зоны', async () => {
      const { registry, owner, alice } = await deployRegistry();
      await register(registry, alice, '.r3');
      await registry.connect(owner).blockTLD('.r3', 'fraud');
      await expect(registry.connect(alice).renewTLD('.r3')).to.be.revertedWithCustomError(
        registry,
        'TLDIsBlocked',
      );
    });

    it('после истечения срок считается от текущего времени', async () => {
      const { registry, alice } = await deployRegistry();
      await register(registry, alice, '.r4');
      await time.increase(Number(PERIOD) + 10 * 24 * 60 * 60);
      expect(await registry.isExpired('.r4')).to.equal(true);
      const tx = await registry.connect(alice).renewTLD('.r4');
      const receipt = await tx.wait();
      const block = await ethers.provider.getBlock(receipt!.blockNumber);
      const after = await registry.getTLD('.r4');
      expect(after.expiresAt).to.equal(BigInt(block!.timestamp) + PERIOD);
      expect(await registry.isExpired('.r4')).to.equal(false);
    });
  });

  describe('setTLDMetadata', () => {
    it('обновляет метаданные владельцем', async () => {
      const { registry, alice } = await deployRegistry();
      await register(registry, alice, '.m1', 'old');
      await expect(registry.connect(alice).setTLDMetadata('.m1', 'new'))
        .to.emit(registry, 'TLDMetadataUpdated')
        .withArgs('.m1', alice.address, 'new', anyUint());
      expect((await registry.getTLD('.m1')).metadata).to.equal('new');
    });

    it('отклоняет обновление не-владельцем', async () => {
      const { registry, alice, bob } = await deployRegistry();
      await register(registry, alice, '.m2');
      await expect(
        registry.connect(bob).setTLDMetadata('.m2', 'hack'),
      ).to.be.revertedWithCustomError(registry, 'NotTLDOwner');
    });

    it('отклоняет слишком длинные метаданные', async () => {
      const { registry, alice } = await deployRegistry();
      await register(registry, alice, '.m3');
      await expect(
        registry.connect(alice).setTLDMetadata('.m3', 'x'.repeat(513)),
      ).to.be.revertedWithCustomError(registry, 'MetadataTooLong');
    });
  });

  describe('block / unblock', () => {
    it('блокирует и разблокирует зону (owner контракта)', async () => {
      const { registry, owner, alice } = await deployRegistry();
      await register(registry, alice, '.b1');
      await expect(registry.connect(owner).blockTLD('.b1', 'phishing'))
        .to.emit(registry, 'TLDBlocked')
        .withArgs('.b1', 'phishing', owner.address, anyUint());
      expect(await registry.isBlocked('.b1')).to.equal(true);
      await expect(registry.connect(owner).unblockTLD('.b1')).to.emit(registry, 'TLDUnblocked');
      expect(await registry.isBlocked('.b1')).to.equal(false);
    });

    it('только owner может блокировать', async () => {
      const { registry, alice } = await deployRegistry();
      await register(registry, alice, '.b2');
      await expect(registry.connect(alice).blockTLD('.b2', 'self')).to.be.revertedWithCustomError(
        registry,
        'OwnableUnauthorizedAccount',
      );
    });

    it('отклоняет пустую причину и повторную блокировку', async () => {
      const { registry, owner, alice } = await deployRegistry();
      await register(registry, alice, '.b3');
      await expect(registry.connect(owner).blockTLD('.b3', '')).to.be.revertedWithCustomError(
        registry,
        'InvalidReason',
      );
      await registry.connect(owner).blockTLD('.b3', 'reason');
      await expect(registry.connect(owner).blockTLD('.b3', 'again')).to.be.revertedWithCustomError(
        registry,
        'TLDIsBlocked',
      );
      await registry.connect(owner).unblockTLD('.b3');
      await expect(registry.connect(owner).unblockTLD('.b3')).to.be.revertedWithCustomError(
        registry,
        'TLDNotBlocked',
      );
    });

    it('блокировка запрещает продление и изменение метаданных', async () => {
      const { registry, owner, alice } = await deployRegistry();
      await register(registry, alice, '.b4');
      await registry.connect(owner).blockTLD('.b4', 'reason');
      await expect(registry.connect(alice).renewTLD('.b4')).to.be.revertedWithCustomError(
        registry,
        'TLDIsBlocked',
      );
      await expect(
        registry.connect(alice).setTLDMetadata('.b4', 'x'),
      ).to.be.revertedWithCustomError(registry, 'TLDIsBlocked');
    });
  });

  describe('pause', () => {
    it('останавливает мутации и возобновляет их', async () => {
      const { registry, owner, alice, bob } = await deployRegistry();
      await register(registry, alice, '.p1');
      await registry.connect(owner).pause();
      expect(await registry.paused()).to.equal(true);
      await expect(registry.connect(alice).registerTLD('.p2', '')).to.be.revertedWithCustomError(
        registry,
        'EnforcedPause',
      );
      await expect(registry.connect(alice).renewTLD('.p1')).to.be.revertedWithCustomError(
        registry,
        'EnforcedPause',
      );
      await expect(
        registry.connect(alice).transferTLD('.p1', bob.address),
      ).to.be.revertedWithCustomError(registry, 'EnforcedPause');
      await expect(
        registry.connect(alice).setTLDMetadata('.p1', 'x'),
      ).to.be.revertedWithCustomError(registry, 'EnforcedPause');
      await registry.connect(owner).unpause();
      await register(registry, alice, '.p2');
      expect(await registry.exists('.p2')).to.equal(true);
    });

    it('только owner может ставить паузу', async () => {
      const { registry, alice } = await deployRegistry();
      await expect(registry.connect(alice).pause()).to.be.revertedWithCustomError(
        registry,
        'OwnableUnauthorizedAccount',
      );
    });
  });

  describe('reclaim истёкших зон', () => {
    it('после истечения и грейс-периода зону может занять другой адрес', async () => {
      const { registry, alice, bob } = await deployRegistry(true);
      await register(registry, alice, '.expiring');
      await time.increase(Number(PERIOD + GRACE) + 60);
      expect(await registry.isReclaimable('.expiring')).to.equal(true);
      await expect(registry.connect(bob).registerTLD('.expiring', 'new owner')).to.emit(
        registry,
        'TLDRegistered',
      );
      expect(await registry.ownerOf('.expiring')).to.equal(bob.address);
      expect((await registry.getTLD('.expiring')).metadata).to.equal('new owner');
      expect(await registry.totalZones()).to.equal(1n);
    });

    it('в течение грейс-периода reclaim запрещён', async () => {
      const { registry, alice, bob } = await deployRegistry(true);
      await register(registry, alice, '.grace');
      await time.increase(Number(PERIOD) + 60);
      expect(await registry.isReclaimable('.grace')).to.equal(false);
      await expect(registry.connect(bob).registerTLD('.grace', '')).to.be.revertedWithCustomError(
        registry,
        'TLDAlreadyExists',
      );
    });

    it('reclaim выключен по умолчанию при allowReclaim=false', async () => {
      const { registry, alice, bob } = await deployRegistry(false);
      await register(registry, alice, '.locked');
      await time.increase(Number(PERIOD + GRACE) + 60);
      await expect(registry.connect(bob).registerTLD('.locked', '')).to.be.revertedWithCustomError(
        registry,
        'TLDAlreadyExists',
      );
    });

    it('заблокированную истёкшую зону нельзя перехватить', async () => {
      const { registry, owner, alice, bob } = await deployRegistry(true);
      await register(registry, alice, '.blocked-exp');
      await registry.connect(owner).blockTLD('.blocked-exp', 'abuse');
      await time.increase(Number(PERIOD + GRACE) + 60);
      await expect(
        registry.connect(bob).registerTLD('.blocked-exp', ''),
      ).to.be.revertedWithCustomError(registry, 'TLDAlreadyExists');
    });
  });

  describe('views и служебные функции', () => {
    it('ownerOf/getTLD для неизвестной зоны реверсят TLDNotFound', async () => {
      const { registry } = await deployRegistry();
      await expect(registry.ownerOf('.none')).to.be.revertedWithCustomError(
        registry,
        'TLDNotFound',
      );
      await expect(registry.getTLD('.none')).to.be.revertedWithCustomError(registry, 'TLDNotFound');
      expect(await registry.exists('.none')).to.equal(false);
    });

    it('allTLDs и tldsOfOwner возвращают корректные наборы', async () => {
      const { registry, alice, bob } = await deployRegistry();
      await register(registry, alice, '.a1');
      await register(registry, alice, '.a2');
      await register(registry, bob, '.b1');
      expect(await registry.totalZones()).to.equal(3n);
      expect([...(await registry.allTLDs(0, 10))]).to.deep.equal(['.a1', '.a2', '.b1']);
      expect([...(await registry.allTLDs(1, 1))]).to.deep.equal(['.a2']);
      expect([...(await registry.allTLDs(5, 10))]).to.deep.equal([]);
      expect([...(await registry.tldsOfOwner(alice.address))]).to.deep.equal(['.a1', '.a2']);
      expect([...(await registry.tldsOfOwner(bob.address))]).to.deep.equal(['.b1']);
    });

    it('возвращает списки резервов и чёрного списка', async () => {
      const { registry, owner } = await deployRegistry();
      await registry.connect(owner).addBlacklistedWord('PHISH');
      await registry.connect(owner).addReservedTLD('.seed');
      expect([...(await registry.blacklistedWords())]).to.deep.equal(['phish']);
      expect([...(await registry.reservedTLDs())]).to.deep.equal(['.seed']);
      expect([...(await registry.builtinReservedTLDs())].length).to.equal(10);
    });

    it('setAllowReclaim управляется только owner', async () => {
      const { registry, owner, alice } = await deployRegistry();
      // ethers v6: после .connect() тип сужается до BaseContract, поэтому описываем метод локально.
      type SetAllowReclaim = { setAllowReclaim(value: boolean): Promise<unknown> };
      await (registry.connect(owner) as unknown as SetAllowReclaim).setAllowReclaim(false);
      expect(await registry.allowReclaim()).to.equal(false);
      await expect(
        (registry.connect(alice) as unknown as SetAllowReclaim).setAllowReclaim(true),
      ).to.be.revertedWithCustomError(registry, 'OwnableUnauthorizedAccount');
    });
  });
});

function anyUint(): (value: unknown) => boolean {
  return (value: unknown) => typeof value === 'bigint' && value > 0n;
}
