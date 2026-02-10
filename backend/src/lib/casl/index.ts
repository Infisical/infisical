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

const glob: JsInterpreter<FieldCondition<string>> = (node, object, context) => {
  const secretPath = context.get(object, node.field) as string;
  const permissionSecretGlobPath = node.value;
  if (permissionSecretGlobPath === "") return false;
  return picomatch.isMatch(secretPath, permissionSecretGlobPath, { strictSlashes: false });
};

export const conditionsMatcher = buildMongoQueryMatcher({ $glob }, { glob });

export enum PermissionConditionOperators {
  $IN = "$in",
  $EQ = "$eq",
  $NEQ = "$ne",
  $GLOB = "$glob",
  $ELEMENTMATCH = "$elemMatch"
}
