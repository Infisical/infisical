const MAX_RANDOM_VALUES_BYTES = 65_536;
const textEncoder = new TextEncoder();
const textDecoder = new TextDecoder("utf-8", { ignoreBOM: true });

const encodeBase64 = (uint8Array: Uint8Array) => btoa(String.fromCharCode(...uint8Array));
const decodeBase64 = (base64String: string) =>
  new Uint8Array([...atob(base64String)].map((c) => c.charCodeAt(0)));
const encodeUtf8 = (value: string) => textEncoder.encode(value);
const decodeUtf8 = (value: Uint8Array) => textDecoder.decode(value);

const randomHex = (byteLength: number) => {
  if (!Number.isSafeInteger(byteLength) || byteLength < 0) {
    throw new RangeError("Byte length must be a non-negative integer");
  }

  const bytes = new Uint8Array(byteLength);

  for (let offset = 0; offset < bytes.length; offset += MAX_RANDOM_VALUES_BYTES) {
    globalThis.crypto.getRandomValues(
      bytes.subarray(offset, Math.min(offset + MAX_RANDOM_VALUES_BYTES, bytes.length))
    );
  }

  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
};

export { decodeBase64, decodeUtf8, encodeBase64, encodeUtf8, randomHex };
