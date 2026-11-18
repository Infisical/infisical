import { InstanceEncryptionKey } from "../../models/instance-encryption-key";
import { RootKey } from "../../models/root-key";
import type { TRootKeyWrapping } from "./root-key-wrappings";
import type { TKmsCoreEnv } from "./service";

// Wraps with the instance encryption key from the environment (the KEK).
export class SoftwareRootKeyWrapping implements TRootKeyWrapping {
  constructor(
    private readonly env: TKmsCoreEnv,
    private readonly isFipsEnabled: () => boolean
  ) {}

  // eslint-disable-next-line class-methods-use-this
  async generate(): Promise<RootKey> {
    return RootKey.generate();
  }

  async wrap(rootKey: RootKey): Promise<Buffer> {
    return InstanceEncryptionKey.fromEnv(this.env).wrapRootKey(rootKey);
  }

  async unwrap(encryptedRootKey: Buffer): Promise<RootKey> {
    return InstanceEncryptionKey.fromEnv(this.env).unwrapRootKey(encryptedRootKey);
  }

  assertCanBoot(): void {
    InstanceEncryptionKey.assertConfigured(this.env, this.isFipsEnabled());
  }

  assertSwitchTarget(): void {
    InstanceEncryptionKey.assertConfiguredForSwitch(this.env);
  }
}
