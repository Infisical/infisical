import { randomInt } from "crypto";
import RandExp from "randexp";
import RE2 from "re2";

import { BadRequestError } from "@app/lib/errors";

import { ConstraintTarget, ConstraintType, TConstraint } from "./secret-validation-rule-types";

const DEFAULT_MIN_LENGTH = 16;
const DEFAULT_MAX_LENGTH = 64;

const CHAR_POOL = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_.~!*";

const generateRandomString = (length: number): string => {
  let out = "";
  for (let i = 0; i < length; i += 1) {
    out += CHAR_POOL[randomInt(0, CHAR_POOL.length)];
  }
  return out;
};

/**
 * Mirrors the frontend `generateFromConstraints` in PasswordGenerator.tsx.
 *
 * When a regex constraint is present it takes full precedence: RandExp generates
 * the middle segment directly from the pattern, making the result structurally
 * valid without a retry loop. Length constraints only apply when there is no
 * regex. Prefix and suffix are always prepended/appended to the middle.
 *
 * The tradeoff is explicit: if a user combines regex with min/max length they
 * should express the length requirement inside the pattern itself — the same
 * warning shown in the frontend UI.
 */
export const generatePasswordWithConstraints = (constraints: TConstraint[]): string => {
  let prefixConstraint: TConstraint | undefined;
  let suffixConstraint: TConstraint | undefined;
  let regexConstraint: TConstraint | undefined;
  let minLengthConstraint: TConstraint | undefined;
  let maxLengthConstraint: TConstraint | undefined;

  for (const c of constraints) {
    // eslint-disable-next-line no-continue
    if (c.appliesTo !== ConstraintTarget.GeneratedPassword) continue;
    if (c.type === ConstraintType.RequiredPrefix) prefixConstraint = c;
    else if (c.type === ConstraintType.RequiredSuffix) suffixConstraint = c;
    else if (c.type === ConstraintType.RegexPattern) regexConstraint = c;
    else if (c.type === ConstraintType.MinLength) minLengthConstraint = c;
    else if (c.type === ConstraintType.MaxLength) maxLengthConstraint = c;
  }

  const prefix = prefixConstraint?.value ?? "";
  const suffix = suffixConstraint?.value ?? "";

  let middle: string;

  if (regexConstraint) {
    // Validate the pattern first with RE2 (ReDoS-safe), then generate with RandExp.
    let validatedPattern: string;
    try {
      // RE2 constructor throws on invalid or ReDoS-prone patterns
      const validated = new RE2(regexConstraint.value);
      validatedPattern = validated.source;
    } catch {
      throw new BadRequestError({
        message: `Secret validation rule contains an invalid regex pattern: ${regexConstraint.value}`
      });
    }
    try {
      middle = new RandExp(new RegExp(validatedPattern)).gen();
    } catch {
      throw new BadRequestError({
        message: `Could not generate a value from regex pattern: ${regexConstraint.value}`
      });
    }
  } else {
    const minLength = minLengthConstraint ? Number(minLengthConstraint.value) : DEFAULT_MIN_LENGTH;
    // When no max is set, default to at least minLength so a min-only rule never
    // produces an impossible length window.
    const maxLength = maxLengthConstraint ? Number(maxLengthConstraint.value) : Math.max(DEFAULT_MAX_LENGTH, minLength);

    if (!Number.isFinite(minLength) || !Number.isFinite(maxLength) || minLength > maxLength) {
      throw new BadRequestError({
        message: "Secret validation rule has impossible length constraints"
      });
    }

    const fixedLength = prefix.length + suffix.length;
    if (fixedLength > maxLength) {
      throw new BadRequestError({
        message: "Secret validation rule prefix/suffix exceeds max length"
      });
    }

    const targetMinFill = Math.max(0, minLength - fixedLength);
    const targetMaxFill = maxLength - fixedLength;
    const fillLength =
      targetMaxFill === targetMinFill ? targetMinFill : targetMinFill + randomInt(0, targetMaxFill - targetMinFill + 1);

    middle = generateRandomString(fillLength);
  }

  return `${prefix}${middle}${suffix}`;
};
