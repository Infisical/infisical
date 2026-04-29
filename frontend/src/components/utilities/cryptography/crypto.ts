const encodeBase64 = (uint8Array: Uint8Array) => btoa(String.fromCharCode(...uint8Array));
const decodeBase64 = (base64String: string) =>
  new Uint8Array([...atob(base64String)].map((c) => c.charCodeAt(0)));

export { decodeBase64, encodeBase64 };
