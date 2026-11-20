import { RuleViolationError } from "@app/domains/lib/errors";

import { RootKey } from "../../models/root-key";
import { TRootKeyWrapper } from "../dependencies";
import type { TRootKeyWrapping } from "./root-key-wrappings";

// Wraps with the HSM, which the enterprise edition plugs in.
export class HsmRootKeyWrapping implements TRootKeyWrapping {
  constructor(private readonly wrapper: TRootKeyWrapper | undefined) {}

  async generate(): Promise<RootKey> {
    return RootKey.fromBytes(await this.require().randomBytes(32));
  }

  async wrap(rootKey: RootKey): Promise<Buffer> {
    const hsm = await this.ready("encrypt");
    return hsm.wrap(rootKey.exportForWrapping());
  }

  async unwrap(encryptedRootKey: Buffer): Promise<RootKey> {
    const hsm = await this.ready("decrypt");
    return RootKey.fromBytes(await hsm.unwrap(encryptedRootKey));
  }

  assertCanBoot(): void {
    this.require().assertEntitled();
  }

  assertSwitchTarget(): void {
    this.require().assertEntitled();
  }

  private require(): TRootKeyWrapper {
    if (!this.wrapper) {
      throw new RuleViolationError({
        message: "The root key is wrapped with an HSM, which requires the Infisical enterprise edition."
      });
    }
    return this.wrapper;
  }

  private async ready(action: "encrypt" | "decrypt"): Promise<TRootKeyWrapper> {
    const hsm = this.require();
    if (!(await hsm.isConfigured())) {
      throw new RuleViolationError({
        message: `Unable to ${action} root KMS key. HSM service is inactive. Did you configure the HSM?`
      });
    }
    return hsm;
  }
}
