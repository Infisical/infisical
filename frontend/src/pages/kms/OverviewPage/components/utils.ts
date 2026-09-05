const base64Pattern = /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/;
const hexPattern = /^(?:0x)?(?:[\da-fA-F]{2})+$/;

export type PublicKeyFormat = "byte-array" | "hexadecimal" | "base64" | "pem";

const getPemBody = (value: string) => {
  const match = value
    .trim()
    .match(/^-----BEGIN PUBLIC KEY-----\s*([\s\S]*?)\s*-----END PUBLIC KEY-----$/);

  return match?.[1].replaceAll(/\s/g, "");
};

export const getPublicKeyFormat = (value: string): PublicKeyFormat | undefined => {
  const trimmedValue = value.trim();

  const pemBody = getPemBody(trimmedValue);
  if (pemBody) {
    return base64Pattern.test(pemBody) && Buffer.from(pemBody, "base64").length > 0
      ? "pem"
      : undefined;
  }

  if (trimmedValue.startsWith("[")) {
    try {
      const bytes: unknown = JSON.parse(trimmedValue);
      return Array.isArray(bytes) &&
        bytes.length > 0 &&
        bytes.every((byte) => Number.isInteger(byte) && byte >= 0 && byte <= 255)
        ? "byte-array"
        : undefined;
    } catch {
      return undefined;
    }
  }

  const normalizedValue = trimmedValue.replaceAll(/\s/g, "");
  if (hexPattern.test(normalizedValue)) return "hexadecimal";

  if (base64Pattern.test(normalizedValue) && Buffer.from(normalizedValue, "base64").length > 0) {
    return "base64";
  }

  return undefined;
};

export const parsePublicKey = (value: string): Buffer | undefined => {
  const format = getPublicKeyFormat(value);
  if (!format) return undefined;

  const normalizedValue = value.trim().replaceAll(/\s/g, "");
  if (format === "byte-array") return Buffer.from(JSON.parse(normalizedValue));
  if (format === "hexadecimal") return Buffer.from(normalizedValue.replace(/^0x/i, ""), "hex");
  if (format === "pem") return Buffer.from(getPemBody(value) as string, "base64");

  return Buffer.from(normalizedValue, "base64");
};
