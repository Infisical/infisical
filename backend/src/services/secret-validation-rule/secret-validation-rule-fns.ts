import picomatch from "picomatch";
import RE2 from "re2";

import { BadRequestError } from "@app/lib/errors";

import {
  ConstraintTarget,
  ConstraintType,
  SecretValidationRuleType,
  TConstraint,
  TSecretValidationRuleInputs,
  TStaticSecretsInputs
} from "./secret-validation-rule-types";

type TExistingRule = {
  id: string;
  name: string;
  envId?: string | null;
  secretPath: string;
  type: string;
  inputs?: unknown;
};

const doPathsOverlap = (pathA: string, pathB: string): boolean => {
  const opts: picomatch.PicomatchOptions = { strictSlashes: false };

  if (picomatch.isMatch(pathA, pathB, opts) || picomatch.isMatch(pathB, pathA, opts)) {
    return true;
  }

  // When both sides are globs, check if the non-glob prefix of one is
  // reachable from the other pattern.  e.g. "/a/**" vs "/a/b/*" → the
  // prefix "/a/b" is matched by "/a/**".
  const scanA = picomatch.scan(pathA);
  const scanB = picomatch.scan(pathB);

  if (scanA.isGlob && scanB.isGlob) {
    const prefixA = scanA.base || "/";
    const prefixB = scanB.base || "/";

    if (picomatch.isMatch(prefixA, pathB, opts) || picomatch.isMatch(prefixB, pathA, opts)) {
      return true;
    }
  }

  return false;
};

const doEnvironmentsOverlap = (envIdA: string | null | undefined, envIdB: string | null | undefined): boolean => {
  if (!envIdA || !envIdB) return true;
  return envIdA === envIdB;
};

/**
 * For static secrets: two rules conflict if they share any constraint of the
 * same type + appliesTo target in overlapping scope.  This is because two
 * constraints of the same kind on the same target can contradict each other
 * (e.g. two different regex patterns on the value).
 */
const $checkStaticSecretsConstraintOverlap = (
  incoming: TStaticSecretsInputs,
  existing: TStaticSecretsInputs
): ConstraintType[] => {
  const overlapping: ConstraintType[] = [];

  for (const incomingConstraint of incoming.constraints) {
    for (const existingConstraint of existing.constraints) {
      if (
        incomingConstraint.type === existingConstraint.type &&
        incomingConstraint.appliesTo === existingConstraint.appliesTo
      ) {
        overlapping.push(incomingConstraint.type);
      }
    }
  }

  return overlapping;
};

type TOverlapChecker<TInputs = TSecretValidationRuleInputs> = (
  incoming: TInputs,
  existing: TInputs
) => ConstraintType[];

const overlapCheckersByType: Record<SecretValidationRuleType, TOverlapChecker> = {
  [SecretValidationRuleType.StaticSecrets]: $checkStaticSecretsConstraintOverlap as TOverlapChecker
};

export const checkForOverlappingRules = ({
  ruleType,
  envId,
  secretPath,
  inputs,
  existingRules,
  excludeRuleId
}: {
  ruleType: SecretValidationRuleType;
  envId: string | null;
  secretPath: string;
  inputs: TSecretValidationRuleInputs;
  existingRules: TExistingRule[];
  excludeRuleId?: string;
}): void => {
  const checker = overlapCheckersByType[ruleType as SecretValidationRuleType];
  if (!checker) {
    return;
  }

  for (const existing of existingRules) {
    // if the rule is the one being updated, skip the check
    if (excludeRuleId && existing.id === excludeRuleId) {
      // eslint-disable-next-line no-continue
      continue;
    }

    // if the rule type doesn't match, skip the check
    if (existing.type !== ruleType) {
      // eslint-disable-next-line no-continue
      continue;
    }

    // if the env or folder ID doesn't overlap, skip the check
    if (!doEnvironmentsOverlap(envId, existing.envId) || !doPathsOverlap(secretPath, existing.secretPath)) {
      // eslint-disable-next-line no-continue
      continue;
    }

    // at this point we're sure that the rule is overlapping with other rules, so we check if the constraints themselves are overlapping
    const overlappingConstraints = checker(inputs, existing.inputs as TSecretValidationRuleInputs);

    if (overlappingConstraints.length > 0) {
      const constraintList = [...new Set(overlappingConstraints)].join(", ");
      throw new BadRequestError({
        message:
          `Rule "${existing.name}" already enforces overlapping constraints (${constraintList}) ` +
          `on the same scope. Adjust the environment, path, or constraints to avoid conflicts.`
      });
    }
  }
};

// ---------------------------------------------------------------------------
// Constraint enforcement — evaluate rules against secrets
// ---------------------------------------------------------------------------

type TSecretToValidate = {
  key: string;
  value?: string;
};

type TValidationRule = {
  name: string;
  envId?: string | null;
  secretPath: string;
  type: string;
  inputs: unknown;
};

type TValidationViolation = {
  secretKey: string;
  ruleName: string;
  constraintType: ConstraintType;
  message: string;
};

const CONSTRAINT_LABELS: Record<ConstraintType, string> = {
  [ConstraintType.MinLength]: "Minimum length",
  [ConstraintType.MaxLength]: "Maximum length",
  [ConstraintType.RegexPattern]: "Regex pattern",
  [ConstraintType.RequiredPrefix]: "Required prefix",
  [ConstraintType.RequiredSuffix]: "Required suffix"
};

const TARGET_LABELS: Record<ConstraintTarget, string> = {
  [ConstraintTarget.SecretKey]: "key",
  [ConstraintTarget.SecretValue]: "value"
};

const evaluateConstraint = (constraint: TConstraint, secret: TSecretToValidate): string | null => {
  const targetValue = constraint.appliesTo === ConstraintTarget.SecretKey ? secret.key : (secret.value ?? "");
  const targetLabel = TARGET_LABELS[constraint.appliesTo];

  switch (constraint.type) {
    case ConstraintType.MinLength: {
      const min = Number(constraint.value);

      if (Number.isNaN(min)) {
        return `${targetLabel} must be at least ${min} characters (got ${targetValue.length})`;
      }

      if (targetValue.length < min) {
        return `${targetLabel} must be at least ${min} characters (got ${targetValue.length})`;
      }
      return null;
    }
    case ConstraintType.MaxLength: {
      const max = Number(constraint.value);

      if (Number.isNaN(max)) {
        return `${targetLabel} must be at most ${max} characters (got ${targetValue.length})`;
      }

      if (targetValue.length > max) {
        return `${targetLabel} must be at most ${max} characters (got ${targetValue.length})`;
      }
      return null;
    }
    case ConstraintType.RegexPattern: {
      try {
        const regex = new RE2(constraint.value);
        if (!regex.test(targetValue)) {
          return `${targetLabel} must match pattern ${constraint.value}`;
        }
        return null;
      } catch {
        // re2 throws an error if the pattern is invalid
        return `${targetLabel} must match pattern ${constraint.value}`;
      }
    }
    case ConstraintType.RequiredPrefix: {
      if (!targetValue.startsWith(constraint.value)) {
        return `${targetLabel} must start with "${constraint.value}"`;
      }
      return null;
    }
    case ConstraintType.RequiredSuffix: {
      if (!targetValue.endsWith(constraint.value)) {
        return `${targetLabel} must end with "${constraint.value}"`;
      }
      return null;
    }
    default:
      return null;
  }
};

/**
 * Evaluate static secret constraints against a set of secrets.
 */
const enforceStaticSecretsRules = (rules: TValidationRule[], secrets: TSecretToValidate[]): TValidationViolation[] => {
  const violations: TValidationViolation[] = [];

  for (const rule of rules) {
    const inputs = rule.inputs as TStaticSecretsInputs | undefined;
    if (!inputs?.constraints?.length) {
      // eslint-disable-next-line no-continue
      continue;
    }

    for (const secret of secrets) {
      for (const constraint of inputs.constraints) {
        const error = evaluateConstraint(constraint, secret);
        if (error) {
          violations.push({
            secretKey: secret.key,
            ruleName: rule.name,
            constraintType: constraint.type,
            message: error
          });
        }
      }
    }
  }

  return violations;
};

// Registry of enforcement functions per rule type.
// To add a new rule type, implement an enforcer and add it here.
type TRuleEnforcer = (rules: TValidationRule[], secrets: TSecretToValidate[]) => TValidationViolation[];

const ruleEnforcersByType: Record<SecretValidationRuleType, TRuleEnforcer> = {
  [SecretValidationRuleType.StaticSecrets]: enforceStaticSecretsRules
};

/**
 * Finds matching rules for the given scope and evaluates all constraints
 * against the provided secrets. Throws a BadRequestError if any violation
 * is found.
 *
 * @param projectRules  All rules for the project (caller fetches from DAL)
 * @param envId         The environment ID of the secrets being written
 * @param secretPath    The path where secrets are being written (concrete, not a glob)
 * @param secrets       The plaintext secrets to validate
 */
export const enforceSecretValidationRules = ({
  projectRules,
  envId,
  secretPath,
  secrets
}: {
  projectRules: TValidationRule[];
  envId: string;
  secretPath: string;
  secrets: TSecretToValidate[];
}): void => {
  if (!projectRules.length || !secrets.length) return;

  const matchingRulesByType = new Map<SecretValidationRuleType, TValidationRule[]>();

  for (const rule of projectRules) {
    // Check environment match (null envId on rule = all environments)
    if (rule.envId && rule.envId !== envId) {
      // eslint-disable-next-line no-continue
      continue;
    }

    // Check path match (rule.secretPath may be a glob)
    if (!picomatch.isMatch(secretPath, rule.secretPath, { strictSlashes: false })) {
      // eslint-disable-next-line no-continue
      continue;
    }

    const ruleType = rule.type as SecretValidationRuleType;
    const existing = matchingRulesByType.get(ruleType) || [];
    existing.push(rule);
    matchingRulesByType.set(ruleType, existing);
  }

  const allViolations: TValidationViolation[] = [];

  for (const [ruleType, matchedRules] of matchingRulesByType) {
    const enforcer = ruleEnforcersByType[ruleType];
    if (!enforcer) {
      // eslint-disable-next-line no-continue
      continue;
    }
    const violations = enforcer(matchedRules, secrets);
    allViolations.push(...violations);
  }

  if (allViolations.length > 0) {
    const details = allViolations.map(
      (v) =>
        `Secret "${v.secretKey}": ${v.message} (rule: "${v.ruleName}", constraint: ${CONSTRAINT_LABELS[v.constraintType]})`
    );

    throw new BadRequestError({
      message: `Secret validation failed:\n${details.join("\n\n")}`
    });
  }
};
