/* eslint-disable no-underscore-dangle */
import type { SourceData } from "@smithy/types";
import { Hash, Hmac } from "crypto";

import { crypto } from "@app/lib/crypto";

export class CustomAWSHasher {
  public algorithmIdentifier: string = "sha256";

  public secret: SourceData | undefined;

  public hash: Hash | Hmac | undefined;

  private _hash: Hash | Hmac | undefined;

  constructor(secret?: SourceData) {
    this.secret = secret;
    this.reset();
  }

  reset() {
    if (this.secret) {
      // Convert any secret type to Buffer
      let secretBuffer = this.secret as Buffer;
      if (this.secret instanceof ArrayBuffer) {
        secretBuffer = Buffer.from(this.secret);
      } else if (ArrayBuffer.isView && ArrayBuffer.isView(this.secret)) {
        secretBuffer = Buffer.from(this.secret.buffer, this.secret.byteOffset, this.secret.byteLength);
      }
      this._hash = crypto.nativeCrypto.createHmac(this.algorithmIdentifier, secretBuffer);
    } else {
      this._hash = crypto.nativeCrypto.createHash(this.algorithmIdentifier);
    }
    return this;
  }

  update(data: SourceData) {
    // Handle all possible data types
    let buffer: Buffer = data as Buffer;
    if (typeof data === "string") {
      buffer = Buffer.from(data, "utf8");
    } else if (data instanceof ArrayBuffer) {
      buffer = Buffer.from(data);
    } else if (ArrayBuffer.isView && ArrayBuffer.isView(data)) {
      buffer = Buffer.from(data.buffer, data.byteOffset, data.byteLength);
    }

    this._hash?.update(buffer);
    return this;
  }

  digest(): Promise<Uint8Array> {
    const result = new Uint8Array(this._hash?.digest() || []);
    this.reset();
    return Promise.resolve(result);
  }
}
