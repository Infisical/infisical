/* eslint-disable @typescript-eslint/no-unsafe-assignment */
import { buildMongoQueryMatcher } from "@casl/ability";
import { FieldCondition, FieldInstruction, JsInterpreter } from "@ucast/mongo2js";
import picomatch from "picomatch";

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

export const conditionsMatcher = buildMongoQueryMatcher({ $glob }, { glob });

export enum PermissionConditionOperators {
  $IN = "$in",
  $ALL = "$all",
  $EQ = "$eq",
  $NEQ = "$ne",
  $GLOB = "$glob",
  $ELEMENTMATCH = "$elemMatch"
}
