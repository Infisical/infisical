import { createHash, timingSafeEqual } from "node:crypto";

const WRAPPED_KEY_LABEL_BYTES = 32;

const hashLabel = (label: string) => createHash("sha256").update(label).digest();

// A key bound to a label: sha256(label) || key. A key copied onto a row with another label fails to open there
// instead of being handed out. Agent Vault session keys have always used this layout.
export class WrappedKeyPayload {
  private constructor(readonly payload: Buffer) {}

  static build(label: string, key: Buffer): WrappedKeyPayload {
    return new WrappedKeyPayload(Buffer.concat([hashLabel(label), key]));
  }

  static restore(payload: Buffer): WrappedKeyPayload {
    return new WrappedKeyPayload(payload);
  }

  // Null when the payload was not wrapped for this label or is not the expected size.
  open(label: string, keyBytes: number): Buffer | null {
    const belongs =
      this.payload.length === WRAPPED_KEY_LABEL_BYTES + keyBytes &&
      timingSafeEqual(this.payload.subarray(0, WRAPPED_KEY_LABEL_BYTES), hashLabel(label));
    return belongs ? this.payload.subarray(WRAPPED_KEY_LABEL_BYTES) : null;
  }
}
