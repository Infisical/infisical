// Buffer's type allows a SharedArrayBuffer backing, which WebCrypto and the x509/asn1 libraries reject.
// No Buffer here is ever created over a SharedArrayBuffer, so this narrows the type without copying.
export const asNonSharedBuffer = (buffer: Buffer): Buffer<ArrayBuffer> => buffer as Buffer<ArrayBuffer>;
