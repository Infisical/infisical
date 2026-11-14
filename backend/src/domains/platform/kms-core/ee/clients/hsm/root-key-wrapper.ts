import { RuleViolationError } from "@app/domains/lib/errors";

import { TRootKeyWrapper } from "../../../ce/services/dependencies";
import { THsmClient } from "./client";

// Wraps the root key with the HSM. The entitlement is a getter, not a value: a license refreshed after boot can add
// HSM, and the strategy change must see it without a restart.
export class HsmRootKeyWrapper implements TRootKeyWrapper {
  constructor(
    private readonly client: THsmClient,
    private readonly isEntitled: () => boolean
  ) {}

  async isConfigured() {
    return this.client.isActive();
  }

  assertEntitled() {
    if (!this.isEntitled()) {
      throw new RuleViolationError({
        message: "Your license does not include HSM integration. Please upgrade to the Enterprise plan to use HSM."
      });
    }
  }

  randomBytes(length: number) {
    return this.client.randomBytes(length);
  }

  wrap(rootKey: Buffer) {
    return this.client.encrypt(rootKey);
  }

  unwrap(wrapped: Buffer) {
    return this.client.decrypt(wrapped);
  }
}
