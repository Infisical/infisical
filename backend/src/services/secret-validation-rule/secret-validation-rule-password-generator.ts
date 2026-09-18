import RandExp from "randexp";
import RE2 from "re2";

import { crypto } from "@app/lib/crypto";
import { BadRequestError } from "@app/lib/errors";

import { TConstraints } from "./secret-validation-rule-types";

const DEFAULT_MIN_LENGTH = 16;
const DEFAULT_MAX_LENGTH = 64;

const MAX_GENERATED_PASSWORD_LENGTH = 2048;

const DRY_RUN_ITERATIONS = 100;

const CHAR_POOL = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_.~!*";

const SAFE_PASSWORD_ALPHABET = new RE2(/^[A-Za-z0-9\-_.~!*]+$/);

const generateRandomString = (length: number): string => {
  let out = "";
  for (let i = 0; i < length; i += 1) {
    out += CHAR_POOL[crypto.randomInt(0, CHAR_POOL.length)];
  }
  return out;
};

const buildSecureRandExp = (pattern: RegExp): RandExp => {
  const instance = new RandExp(pattern);
  instance.randInt = (a: number, b: number) => crypto.randomInt(a, b + 1);
  return instance;
};

/**
 * Mirrors the frontend `generateFromConstraints` in PasswordGenerator.tsx.
 *
 * A regex pattern takes full precedence: RandExp generates the middle segment straight from the
 * pattern, so the result is structurally valid without a retry loop, and the length bounds are
 * ignored. Express a length requirement inside the pattern when you combine the two — the frontend
 * shows the same warning. Prefix and suffix always wrap the middle.
 */
export const generatePasswordWithConstraints = (constraints: TConstraints): string => {
  const { minLength, maxLength, regexPattern, requiredPrefix, requiredSuffix } = constraints;
  const prefix = requiredPrefix ?? "";
  const suffix = requiredSuffix ?? "";

  let middle: string;

  if (regexPattern) {
    // Validate the pattern first with RE2 (ReDoS-safe), then generate with RandExp.
    let validatedPattern: string;
    try {
      validatedPattern = new RE2(regexPattern).source;
    } catch {
      throw new BadRequestError({
        message: `Secret validation rule contains an invalid regex pattern: ${regexPattern}`
      });
    }
    try {
      middle = buildSecureRandExp(new RegExp(validatedPattern)).gen();
    } catch {
      throw new BadRequestError({
        message: `Could not generate a value from regex pattern: ${regexPattern}`
      });
    }
  } else {
    const min = minLength ?? DEFAULT_MIN_LENGTH;
    // With no maximum, hold the ceiling at or above the minimum so a min-only rule never asks for an
    // impossible length window.
    const max = maxLength ?? Math.max(DEFAULT_MAX_LENGTH, min);

    // The schema only compares two bounds the caller supplied, so a maximum below the default
    // minimum reaches here as an impossible window.
    if (min > max) {
      throw new BadRequestError({
        message:
          minLength === undefined
            ? `Secret validation rule sets a maximum length of ${max}, below the ${DEFAULT_MIN_LENGTH} character minimum used when no minimum is set. Set a minimum length as well.`
            : `Secret validation rule has a minimum length (${min}) above its maximum length (${max})`
      });
    }

    if (max > MAX_GENERATED_PASSWORD_LENGTH) {
      throw new BadRequestError({
        message: `Secret validation rule length constraints exceed the maximum allowed (${MAX_GENERATED_PASSWORD_LENGTH} characters)`
      });
    }

    const fixedLength = prefix.length + suffix.length;
    if (fixedLength > max) {
      throw new BadRequestError({
        message: `Secret validation rule requires a prefix and suffix longer than its maximum length (${max} characters)`
      });
    }

    const minFill = Math.max(0, min - fixedLength);
    const maxFill = max - fixedLength;
    const fillLength = maxFill === minFill ? minFill : minFill + crypto.randomInt(0, maxFill - minFill + 1);

    middle = generateRandomString(fillLength);
  }

  const finalPassword = `${prefix}${middle}${suffix}`;

  if (finalPassword.length > MAX_GENERATED_PASSWORD_LENGTH) {
    throw new BadRequestError({
      message: `Secret validation rule produced a value longer than the maximum allowed (${MAX_GENERATED_PASSWORD_LENGTH} characters). Adjust the rule's regex pattern or length constraints.`
    });
  }

  if (!SAFE_PASSWORD_ALPHABET.test(finalPassword)) {
    throw new BadRequestError({
      message:
        "Secret validation rule produced a value containing characters outside the allowed alphabet (A-Z, a-z, 0-9, and -_.~!*). " +
        "Adjust the rule's regex pattern, required prefix, and required suffix to use only safe characters."
    });
  }

  return finalPassword;
};

export const assertConstraintsProduceSafePasswords = (constraints: TConstraints): void => {
  for (let i = 0; i < DRY_RUN_ITERATIONS; i += 1) {
    generatePasswordWithConstraints(constraints);
  }
};
