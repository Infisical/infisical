import { RuleViolationError } from "@app/domains/lib/errors";

import { InstanceEncryptionKey } from "../../models/instance-encryption-key";
import { RootKey } from "../../models/root-key";
import { RootKeyConfig, RootKeyEncryptionStrategy } from "../../models/root-key-config";
import { TRootKeyWrapper } from "../dependencies";
import { HsmRootKeyWrapping } from "./hsm-root-key-wrapping";
import type { TKmsCoreEnv } from "./service";
import { SoftwareRootKeyWrapping } from "./software-root-key-wrapping";

// How the root key is wrapped at rest under one encryption strategy.
export type TRootKeyWrapping = {
  generate(): Promise<RootKey>;
  wrap(rootKey: RootKey): Promise<Buffer>;
  unwrap(encryptedRootKey: Buffer): Promise<RootKey>;
  // What a boot on this strategy needs before it reads anything.
  assertCanBoot(): void;
  // Refuses a switch to this strategy that this instance cannot serve.
  assertSwitchTarget(): void;
};

// The wrapping for each encryption strategy this instance knows, and what the environment offers.
export class RootKeyWrappings {
  private readonly software: SoftwareRootKeyWrapping;

  private readonly hsm: HsmRootKeyWrapping;

  constructor(
    private readonly env: TKmsCoreEnv,
    isFipsEnabled: () => boolean,
    private readonly rootKeyWrapper: TRootKeyWrapper | undefined
  ) {
    this.software = new SoftwareRootKeyWrapping(env, isFipsEnabled);
    this.hsm = new HsmRootKeyWrapping(rootKeyWrapper);
  }

  // The label of the env key this instance runs with. Null without one, as under HSM.
  get currentKekLabel(): string | null {
    try {
      return InstanceEncryptionKey.fromEnv(this.env).label;
    } catch {
      return null;
    }
  }

  for(strategy: RootKeyEncryptionStrategy | null): TRootKeyWrapping {
    if (strategy === RootKeyEncryptionStrategy.Software) return this.software;
    if (strategy === RootKeyEncryptionStrategy.HSM) return this.hsm;
    throw new RuleViolationError({ message: `Invalid root key encryption strategy: ${String(strategy)}` });
  }

  // Async so an unknown strategy rejects rather than throws: boot skips a software row it can't open and tries the
  // next one, and a synchronous throw would escape that handler and stop the boot.
  async unwrap(config: RootKeyConfig): Promise<RootKey> {
    return this.for(config.strategy).unwrap(config.encryptedRootKey);
  }

  // Whether an HSM is plugged in and passes its self-test.
  isHsmConfigured(): Promise<boolean> {
    return this.rootKeyWrapper ? this.rootKeyWrapper.isConfigured() : Promise.resolve(false);
  }

  // The strategies an admin may pick: software when an env key is set, HSM when its variables are.
  offered(): RootKeyEncryptionStrategy[] {
    const offered: RootKeyEncryptionStrategy[] = [];
    if (this.env.ROOT_ENCRYPTION_KEY || this.env.ENCRYPTION_KEY) offered.push(RootKeyEncryptionStrategy.Software);
    if (this.env.isHsmConfigured) offered.push(RootKeyEncryptionStrategy.HSM);
    return offered;
  }
}
