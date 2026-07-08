export const encodeCdpFrame = (message: Record<string, unknown>): ArrayBuffer => {
  const payload = new TextEncoder().encode(JSON.stringify(message));
  const buffer = new ArrayBuffer(4 + payload.byteLength);
  new DataView(buffer).setUint32(0, payload.byteLength, false);
  new Uint8Array(buffer, 4).set(payload);
  return buffer;
};

// Unwraps length-prefixed CDP frames from the raw tunnel byte stream (see
// framing.go on the gateway). WebSocket messages don't align 1:1 with CDP
// messages, so incoming chunks are buffered and parsed as complete frames
// become available.
export class CdpFrameDecoder {
  private buffer = new Uint8Array(0);

  push(chunk: ArrayBuffer): unknown[] {
    const incoming = new Uint8Array(chunk);
    const merged = new Uint8Array(this.buffer.length + incoming.length);
    merged.set(this.buffer);
    merged.set(incoming, this.buffer.length);
    this.buffer = merged;

    const messages: unknown[] = [];
    for (;;) {
      if (this.buffer.length < 4) break;
      const length = new DataView(this.buffer.buffer, this.buffer.byteOffset, 4).getUint32(
        0,
        false
      );
      if (this.buffer.length < 4 + length) break;

      const payload = this.buffer.slice(4, 4 + length);
      this.buffer = this.buffer.slice(4 + length);

      try {
        messages.push(JSON.parse(new TextDecoder().decode(payload)));
      } catch {
        // skip malformed frame
      }
    }
    return messages;
  }
}
