import crypto from "crypto";

import { CryptographyError } from "@app/lib/errors";

export const hasherFipsValidated = () => {
  const keySize = 32;

  // For the salt when using pkdf2, we do salt rounds^6. If the salt rounds are 10, this will result in 10^6 = 1.000.000 iterations.
  // The reason for this is because pbkdf2 is not as compute intense as bcrypt, making it faster to brute-force.
  // From my testing, doing salt rounds^6 brings the computational power required to a little more than bcrypt.
  // OWASP recommends a minimum of 600.000 iterations for pbkdf2, so 1.000.000 is more than enough.
  // Ref: https://cheatsheetseries.owasp.org/cheatsheets/Password_Storage_Cheat_Sheet.html#pbkdf2
  const MIN_COST_FACTOR = 10;
  const MAX_COST_FACTOR = 20; // Iterations scales polynomial (costFactor^6), so we need an upper bound

  const $calculateIterations = (costFactor: number) => {
    return Math.round(costFactor ** 6);
  };

  const $hashPassword = (password: Buffer, salt: Buffer, iterations: number, keyLength: number) => {
    return new Promise<Buffer>((resolve, reject) => {
      crypto.pbkdf2(password, salt, iterations, keyLength, "sha256", (err, derivedKey) => {
        if (err) {
          return reject(err);
        }
        resolve(derivedKey);
      });
    });
  };

  const $validatePassword = async (
    inputPassword: Buffer,
    storedHash: Buffer,
    salt: Buffer,
    iterations: number,
    keyLength: number
  ) => {
    const computedHash = await $hashPassword(inputPassword, salt, iterations, keyLength);

    return crypto.timingSafeEqual(computedHash, storedHash);
  };

  const hash = async (password: string, costFactor: number) => {
    // Strict input validation
    if (typeof password !== "string" || password.length === 0) {
      throw new CryptographyError({
        message: "Invalid input, password must be a non-empty string"
      });
    }

    if (!Number.isInteger(costFactor)) {
      throw new CryptographyError({
        message: "Invalid cost factor, must be an integer"
      });
    }

    if (costFactor < MIN_COST_FACTOR || costFactor > MAX_COST_FACTOR) {
      throw new CryptographyError({
        message: `Invalid cost factor, must be between ${MIN_COST_FACTOR} and ${MAX_COST_FACTOR}`
      });
    }

    const iterations = $calculateIterations(costFactor);

    const salt = crypto.randomBytes(16);
    const derivedKey = await $hashPassword(Buffer.from(password), salt, iterations, keySize);

    const combined = Buffer.concat([salt, derivedKey]);
    return `$v1$${costFactor}$${combined.toString("base64")}`; // Store original costFactor!
  };

  const compare = async (password: string, hashedPassword: string) => {
    try {
      if (!hashedPassword?.startsWith("$v1$")) return false;

      const parts = hashedPassword.split("$");
      if (parts.length !== 4) return false;

      const [, , storedCostFactor, combined] = parts;

      if (
        !Number.isInteger(Number(storedCostFactor)) ||
        Number(storedCostFactor) < MIN_COST_FACTOR ||
        Number(storedCostFactor) > MAX_COST_FACTOR
      ) {
        return false;
      }

      const combinedBuffer = Buffer.from(combined, "base64");
      const salt = combinedBuffer.subarray(0, 16);
      const storedHash = combinedBuffer.subarray(16);

      const iterations = $calculateIterations(Number(storedCostFactor));

      const isMatch = await $validatePassword(Buffer.from(password), storedHash, salt, iterations, keySize);

      return isMatch;
    } catch {
      return false;
    }
  };

  return {
    hash,
    compare
  };
};
