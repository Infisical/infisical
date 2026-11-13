import { RuleViolationError } from "@app/domains/lib/errors";

import { TRootKeyWrapper } from "../../ce/service/kms-core-hooks";
import { THsmClient } from "../hsm-client/hsm-client";

// Wraps the root key with the HSM, and asks the license for the instance's HSM entitlement each time it is checked.
export class HsmRootKeyWrapper implements TRootKeyWrapper {
  private client: THsmClient | undefined;

  private isEntitled: (() => boolean) | undefined;

  // Called by KmsCoreEeModule.start, once the PKCS#11 library is initialised. A getter, not a value: a license
  // refreshed after boot can add HSM, and the strategy change must see it without a restart.
  attach(client: THsmClient, isEntitled: () => boolean) {
    this.client = client;
    this.isEntitled = isEntitled;
  }

  async isConfigured() {
    return this.client ? this.client.isActive() : false;
  }

  assertEntitled() {
    if (!this.isEntitled?.()) {
      throw new RuleViolationError({
        message: "Your license does not include HSM integration. Please upgrade to the Enterprise plan to use HSM."
      });
    }
  }

  randomBytes(length: number) {
    return this.requireClient().randomBytes(length);
  }

  wrap(rootKey: Buffer) {
    return this.requireClient().encrypt(rootKey);
  }

  unwrap(wrapped: Buffer) {
    return this.requireClient().decrypt(wrapped);
  }

  private requireClient() {
    if (!this.client) throw new RuleViolationError({ message: "HSM service is inactive. Did you configure the HSM?" });
    return this.client;
  }
}
