import { InternalServerError } from "@app/lib/errors";

// The root key in memory. Only start and a strategy change write it; it never leaves the domain.
export class RootKeyHolder {
  private key: Buffer = Buffer.alloc(0);

  get(): Buffer {
    if (!this.key.length) throw new InternalServerError({ message: "KMS root key is not loaded" });
    return this.key;
  }

  set(key: Buffer) {
    this.key = key;
  }
}
