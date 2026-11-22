/* eslint-disable @typescript-eslint/no-unsafe-assignment */
import { buildMongoQueryMatcher } from "@casl/ability";
import { FieldCondition, FieldInstruction, JsInterpreter } from "@ucast/mongo2js";
import picomatch from "picomatch";

import { canonicalizeSecretPath } from "@app/lib/fn/string";

const $glob: FieldInstruction<string> = {
  type: "field",
  validate(instruction, value) {
    if (typeof value !== "string") {
      throw new Error(`"${instruction.name}" expects value to be a string`);
    }
  }
};

// Patterns come from customer roles, so the cache is bounded; the oldest entry is evicted first.
export const MAX_CACHED_GLOB_MATCHERS = 1000;
const globMatchers = new Map<string, (path: string) => boolean>();

// picomatch.isMatch compiles the pattern into a regex on every call, and a secret list runs several checks per secret.
export const getGlobMatcher = (pattern: string) => {
  let matcher = globMatchers.get(pattern);
  if (!matcher) {
    matcher = picomatch(pattern, { strictSlashes: false });
    if (globMatchers.size >= MAX_CACHED_GLOB_MATCHERS) globMatchers.delete(globMatchers.keys().next().value as string);
    globMatchers.set(pattern, matcher);
  }
  return matcher;
};

const glob: JsInterpreter<FieldCondition<string>> = (node, object, context) => {
  const secretPath = context.get(object, node.field) as string;
  const permissionSecretGlobPath = node.value;
  if (permissionSecretGlobPath.trim() === "") return false;
  if (typeof secretPath !== "string") return false;
  return getGlobMatcher(permissionSecretGlobPath)(secretPath);
};

const mongoQueryMatcher = buildMongoQueryMatcher({ $glob }, { glob });

const canonicalizePathValue = (value: unknown): unknown =>
  typeof value === "string" ? canonicalizeSecretPath(value) : value;

// Rules saved before paths were canonicalized can name a folder as "//prod", so plain path values in a rule are
// canonicalized too. Glob patterns are left as they are.
export const canonicalizeSecretPathCondition = (condition: unknown): unknown => {
  if (!condition || typeof condition !== "object" || Array.isArray(condition)) return canonicalizePathValue(condition);
  const operators: Record<string, unknown> = { ...condition };
  if ("$eq" in operators) operators.$eq = canonicalizePathValue(operators.$eq);
  if ("$ne" in operators) operators.$ne = canonicalizePathValue(operators.$ne);
  if (Array.isArray(operators.$in)) operators.$in = (operators.$in as unknown[]).map(canonicalizePathValue);
  return operators;
};

// Rules name folders by their canonical path, so a subject must be matched on the folder its path resolves to,
// whatever spelling of that path the caller sent.
export const conditionsMatcher: typeof mongoQueryMatcher = (conditions) => {
  const secretPathCondition = (conditions as Record<string, unknown> | undefined)?.secretPath;
  const match = mongoQueryMatcher(
    secretPathCondition === undefined
      ? conditions
      : ({ ...conditions, secretPath: canonicalizeSecretPathCondition(secretPathCondition) } as typeof conditions)
  );
  const matchCanonicalPath = (object: Record<string, unknown>) => {
    if (typeof object?.secretPath !== "string") return match(object);
    const secretPath = canonicalizeSecretPath(object.secretPath);
    return match(secretPath === object.secretPath ? object : { ...object, secretPath });
  };
  return Object.assign(matchCanonicalPath, { ast: match.ast });
};

export enum PermissionConditionOperators {
  $IN = "$in",
  $ALL = "$all",
  $EQ = "$eq",
  $NEQ = "$ne",
  $GLOB = "$glob",
  $ELEMENTMATCH = "$elemMatch"
}
