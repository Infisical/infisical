import RandExp from "randexp";

import { crypto } from "@app/lib/crypto";
import { BadRequestError } from "@app/lib/errors";

import { evaluateConstraints } from "../secret-validation-rule-constraint-fns";
import { ConstraintTarget } from "../secret-validation-rule-enums";
import { TValueConstraints } from "../secret-validation-rule-schemas";

const DEFAULT_MIN_LENGTH = 16;
const DEFAULT_MAX_LENGTH = 64;
const MAX_GENERATION_ATTEMPTS = 25;
const CHAR_POOL = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_.~!*";

const randomString = (length: number) => {
  let out = "";
  for (let i = 0; i < length; i += 1) out += CHAR_POOL[crypto.randomInt(0, CHAR_POOL.length)];
  return out;
};

const buildRegexGenerator = (regexPattern: string) => {
  try {
    const generator = new RandExp(regexPattern);
    generator.randInt = (min: number, max: number) => crypto.randomInt(min, max + 1);
    return generator;
  } catch {
    throw new BadRequestError({
      message: `A value can't be generated for the regex pattern "${regexPattern}". It uses syntax the generator doesn't support, so enter a value manually.`
    });
  }
};

/**
 * Generates a static-secret value and accepts a candidate only once the complete value, prefix and suffix
 * included, passes the same constraint evaluation the server applies when the secret is saved. The generator
 * is a best-effort source of candidates; the evaluation decides.
 */
export const generateStaticSecretValue = (constraints: TValueConstraints): string => {
  const { minLength, maxLength, regexPattern, requiredPrefix = "", requiredSuffix = "" } = constraints;
  const fixedLength = requiredPrefix.length + requiredSuffix.length;

  const min = minLength ?? DEFAULT_MIN_LENGTH;
  const max = maxLength ?? Math.max(DEFAULT_MAX_LENGTH, min);

  if (min > max) {
    throw new BadRequestError({
      message: `The rule's minimum length (${min}) is above its maximum length (${max}), so no value can satisfy it.`
    });
  }

  if (fixedLength > max) {
    throw new BadRequestError({
      message: `The rule's required prefix and suffix are ${fixedLength} characters long, above its maximum length of ${max}, so no value can satisfy it.`
    });
  }

  const regexGenerator = regexPattern ? buildRegexGenerator(regexPattern) : undefined;
  let violatedConstraints: string[] = [];

  for (let attempt = 0; attempt < MAX_GENERATION_ATTEMPTS; attempt += 1) {
    let middle: string;
    if (regexGenerator) {
      try {
        middle = regexGenerator.gen();
      } catch {
        throw new BadRequestError({
          message: `A value can't be generated for the regex pattern "${regexPattern}", so enter a value manually.`
        });
      }
    } else {
      const minFill = Math.max(0, min - fixedLength);
      const maxFill = max - fixedLength;
      middle = randomString(minFill + crypto.randomInt(0, maxFill - minFill + 1));
    }

    const candidate = `${requiredPrefix}${middle}${requiredSuffix}`;
    const violations = evaluateConstraints({ constraints, target: ConstraintTarget.SecretValue, value: candidate });
    if (!violations.length) return candidate;

    violatedConstraints = [...new Set(violations.map((violation) => violation.label))];
  }

  throw new BadRequestError({
    message: `No value satisfying the rule could be generated in ${MAX_GENERATION_ATTEMPTS} attempts (failed: ${violatedConstraints.join(", ")}). The constraints may conflict, for example an anchored regex pattern combined with a required prefix or suffix. Enter a value manually.`
  });
};
