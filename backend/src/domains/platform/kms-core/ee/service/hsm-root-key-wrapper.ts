import { BadRequestError } from "@app/lib/errors";

import { TRootKeyWrapper } from "../../ce/service/kms-core-hooks";
import { THsmClient } from "../hsm-client/hsm-client";

// Wraps the root key with the HSM, and holds the instance's HSM entitlement as read at boot.
export class HsmRootKeyWrapper implements TRootKeyWrapper {
  private client: THsmClient | undefined;

  private entitled = false;

  // Called by KmsCoreEeModule.start, once the PKCS#11 library is initialised and the license is read.
  attach(client: THsmClient, entitled: boolean) {
    this.client = client;
    this.entitled = entitled;
  }

  async isConfigured() {
    return this.client ? this.client.isActive() : false;
  }

  assertEntitled() {
    if (!this.entitled) {
      throw new BadRequestError({
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
    if (!this.client) throw new BadRequestError({ message: "HSM service is inactive. Did you configure the HSM?" });
    return this.client;
  }
}
