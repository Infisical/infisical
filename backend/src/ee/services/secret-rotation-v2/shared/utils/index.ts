import { crypto } from "@app/lib/crypto/cryptography";

type TPasswordRequirements = {
  length: number;
  required: {
    lowercase: number;
    uppercase: number;
    digits: number;
    symbols: number;
  };
  allowedSymbols?: string;
};

const DEFAULT_PASSWORD_REQUIREMENTS: TPasswordRequirements = {
  length: 48,
  required: {
    lowercase: 1,
    uppercase: 1,
    digits: 1,
    symbols: 0
  },
  allowedSymbols: "-_.~!*"
};

export const generatePassword = (passwordRequirements?: TPasswordRequirements) => {
  try {
    const { length, required, allowedSymbols } = passwordRequirements ?? DEFAULT_PASSWORD_REQUIREMENTS;

    const chars = {
      lowercase: "abcdefghijklmnopqrstuvwxyz",
      uppercase: "ABCDEFGHIJKLMNOPQRSTUVWXYZ",
      digits: "0123456789",
      symbols: allowedSymbols || "-_.~!*"
    };

    const parts: string[] = [];

    if (required.lowercase > 0) {
      parts.push(
        ...Array(required.lowercase)
          .fill(0)
          .map(() => chars.lowercase[crypto.randomInt(chars.lowercase.length)])
      );
    }

    if (required.uppercase > 0) {
      parts.push(
        ...Array(required.uppercase)
          .fill(0)
          .map(() => chars.uppercase[crypto.randomInt(chars.uppercase.length)])
      );
    }

    if (required.digits > 0) {
      parts.push(
        ...Array(required.digits)
          .fill(0)
          .map(() => chars.digits[crypto.randomInt(chars.digits.length)])
      );
    }

    if (required.symbols > 0) {
      parts.push(
        ...Array(required.symbols)
          .fill(0)
          .map(() => chars.symbols[crypto.randomInt(chars.symbols.length)])
      );
    }

    const requiredTotal = Object.values(required).reduce<number>((a, b) => a + b, 0);
    const remainingLength = Math.max(length - requiredTotal, 0);

    const allowedChars = Object.entries(chars)
      .filter(([key]) => required[key as keyof typeof required] > 0)
      .map(([, value]) => value)
      .join("");

    parts.push(
      ...Array(remainingLength)
        .fill(0)
        .map(() => allowedChars[crypto.randomInt(allowedChars.length)])
    );

    // shuffle the array to mix up the characters
    for (let i = parts.length - 1; i > 0; i -= 1) {
      const j = crypto.randomInt(i + 1);
      [parts[i], parts[j]] = [parts[j], parts[i]];
    }

    return parts.join("");
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown error";
    throw new Error(`Failed to generate password: ${message}`);
  }
};
