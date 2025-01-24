/* eslint-disable @typescript-eslint/no-unsafe-assignment */
import { buildMongoQueryMatcher, createMongoAbility, MongoAbility } from "@casl/ability";
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
  return picomatch.isMatch(secretPath, permissionSecretGlobPath, { strictSlashes: false });
};

export const conditionsMatcher = buildMongoQueryMatcher({ $glob }, { glob });

export enum PermissionConditionOperators {
  $IN = "$in",
  $EQ = "$eq",
  $NEQ = "$ne",
  $GLOB = "$glob"
}

type TPermissionConditionShape = {
  [PermissionConditionOperators.$EQ]: string;
  [PermissionConditionOperators.$NEQ]: string;
  [PermissionConditionOperators.$GLOB]: string;
  [PermissionConditionOperators.$IN]: string[];
};

const getPermissionSetContainerID = (action: string, subject: string) => `${action}:${subject}`;
const invertTheOperation = (shouldInvert: boolean, operation: boolean) => (shouldInvert ? !operation : operation);
const formatConditionOperator = (condition: TPermissionConditionShape | string) => {
  return (
    typeof condition === "string" ? { [PermissionConditionOperators.$EQ]: condition } : condition
  ) as TPermissionConditionShape;
};

const isOperatorsASubset = (parentSet: TPermissionConditionShape, subset: TPermissionConditionShape) => {
  if (subset[PermissionConditionOperators.$EQ] || subset[PermissionConditionOperators.$NEQ]) {
    const subsetOperatorValue = subset[PermissionConditionOperators.$EQ] || subset[PermissionConditionOperators.$NEQ];
    const isInverted = Boolean(subset[PermissionConditionOperators.$NEQ]);
    if (
      parentSet[PermissionConditionOperators.$EQ] &&
      invertTheOperation(isInverted, parentSet[PermissionConditionOperators.$EQ] !== subsetOperatorValue)
    ) {
      return false;
    }
    if (
      parentSet[PermissionConditionOperators.$NEQ] &&
      invertTheOperation(isInverted, parentSet[PermissionConditionOperators.$NEQ] === subsetOperatorValue)
    ) {
      return false;
    }
    if (
      parentSet[PermissionConditionOperators.$IN] &&
      invertTheOperation(isInverted, !parentSet[PermissionConditionOperators.$IN].includes(subsetOperatorValue))
    ) {
      return false;
    }
    if (
      parentSet[PermissionConditionOperators.$GLOB] &&
      invertTheOperation(
        isInverted,
        !picomatch.isMatch(subsetOperatorValue, parentSet[PermissionConditionOperators.$GLOB], { strictSlashes: false })
      )
    ) {
      return false;
    }
  }
  if (subset[PermissionConditionOperators.$IN]) {
    const subsetOperatorValue = subset[PermissionConditionOperators.$IN];
    if (
      parentSet[PermissionConditionOperators.$EQ] &&
      (subsetOperatorValue.length !== 1 || subsetOperatorValue[0] !== parentSet[PermissionConditionOperators.$EQ])
    ) {
      return false;
    }
    if (
      parentSet[PermissionConditionOperators.$NEQ] &&
      !subsetOperatorValue.includes(parentSet[PermissionConditionOperators.$NEQ])
    ) {
      return false;
    }
    if (
      parentSet[PermissionConditionOperators.$IN] &&
      !subsetOperatorValue.every((el) => parentSet[PermissionConditionOperators.$IN].includes(el))
    ) {
      return false;
    }
    if (
      parentSet[PermissionConditionOperators.$GLOB] &&
      !subsetOperatorValue.every((el) =>
        picomatch.isMatch(el, parentSet[PermissionConditionOperators.$GLOB], {
          strictSlashes: false
        })
      )
    ) {
      return false;
    }
  }
  if (subset[PermissionConditionOperators.$GLOB]) {
    const subsetOperatorValue = subset[PermissionConditionOperators.$GLOB];
    const { isGlob } = picomatch.scan(subsetOperatorValue);
    // if it's glob, all other fixed operators would make this superset because glob is powerful. like eq
    // example: $in [dev, prod] => glob: dev** could mean anything starting with dev: thus is bigger
    if (
      isGlob &&
      Object.keys(parentSet).some(
        (el) => el !== PermissionConditionOperators.$GLOB && el !== PermissionConditionOperators.$NEQ
      )
    ) {
      return false;
    }

    if (
      parentSet[PermissionConditionOperators.$EQ] &&
      parentSet[PermissionConditionOperators.$EQ] !== subsetOperatorValue
    ) {
      return false;
    }
    if (
      parentSet[PermissionConditionOperators.$NEQ] &&
      picomatch.isMatch(parentSet[PermissionConditionOperators.$NEQ], subsetOperatorValue, {
        strictSlashes: false
      })
    ) {
      return false;
    }
    // if parent set is IN, glob cannot be used for children - It's a bigger scope
    if (
      parentSet[PermissionConditionOperators.$IN] &&
      !parentSet[PermissionConditionOperators.$IN].includes(subsetOperatorValue)
    ) {
      return false;
    }
    if (
      parentSet[PermissionConditionOperators.$GLOB] &&
      !picomatch.isMatch(subsetOperatorValue, parentSet[PermissionConditionOperators.$GLOB], {
        strictSlashes: false
      })
    ) {
      return false;
    }
  }
  return true;
};

const isSubsetForSamePermissionSubjectAction = (
  // [{action, subject,conditions{env: dev}}]
  parentSetRules: ReturnType<MongoAbility["possibleRulesFor"]>,
  // [{action, subject,conditions{env: prod}}, {action, subject,conditions{env: dev,secretPath: "/"}]
  subsetRules: ReturnType<MongoAbility["possibleRulesFor"]>
) => {
  const isMissingConditionInParent = parentSetRules.every((el) => !el.conditions);
  if (isMissingConditionInParent) return true;

  // all subset rules must pass in comparison to parent rul
  return subsetRules.every((subsetRule) => {
    const subsetRuleConditions = subsetRule.conditions as Record<string, TPermissionConditionShape | string>;

    // compare subset rule with all parent rules
    const isSubsetOfNonInvertedParentSet = parentSetRules
      .filter((el) => !el.inverted)
      .some((parentSetRule) => {
        // get conditions and iterate
        const parentSetRuleConditions = parentSetRule?.conditions as Record<string, TPermissionConditionShape | string>;
        if (!parentSetRuleConditions) return true;
        return Object.keys(parentSetRuleConditions).every((parentConditionField) => {
          // if parent condition is missing then it's never a subset
          if (!subsetRuleConditions?.[parentConditionField]) return false;

          // standardize the conditions plain string operator => $eq function
          const parentRuleConditionOperators = formatConditionOperator(parentSetRuleConditions[parentConditionField]);
          const selectedSubsetRuleCondition = subsetRuleConditions?.[parentConditionField];
          const subsetRuleConditionOperators = formatConditionOperator(selectedSubsetRuleCondition);
          return isOperatorsASubset(parentRuleConditionOperators, subsetRuleConditionOperators);
        });
      });

    const invertedParentSetRules = parentSetRules.filter((el) => el.inverted);
    const isNotSubsetOfInvertedParentSet = invertedParentSetRules.length
      ? !invertedParentSetRules.some((parentSetRule) => {
          // get conditions and iterate
          const parentSetRuleConditions = parentSetRule?.conditions as Record<
            string,
            TPermissionConditionShape | string
          >;
          if (!parentSetRuleConditions) return true;
          return Object.keys(parentSetRuleConditions).every((parentConditionField) => {
            // if parent condition is missing then it's never a subset
            if (!subsetRuleConditions?.[parentConditionField]) return false;

            // standardize the conditions plain string operator => $eq function
            const parentRuleConditionOperators = formatConditionOperator(parentSetRuleConditions[parentConditionField]);
            const selectedSubsetRuleCondition = subsetRuleConditions?.[parentConditionField];
            const subsetRuleConditionOperators = formatConditionOperator(selectedSubsetRuleCondition);
            return isOperatorsASubset(parentRuleConditionOperators, subsetRuleConditionOperators);
          });
        })
      : true;
    return isSubsetOfNonInvertedParentSet && isNotSubsetOfInvertedParentSet;
  });
};

/**
 * Compares two sets of permissions to determine if the first set is at least as privileged as the second set.
 * The function checks if all permissions in the second set are contained within the first set and if the first set has equal or more permissions.
 *
 */
export const isAtLeastAsPrivileged = (parentSetPermissions: MongoAbility, subsetPermissions: MongoAbility) => {
  const checkedPermissionRules = new Set<string>();
  for (const subsetPermissionRules of subsetPermissions.rules) {
    const subsetPermissionSubject = subsetPermissionRules.subject.toString();
    let subsetPermissionActions: string[] = [];

    if (typeof subsetPermissionRules.action === "string") {
      subsetPermissionActions.push(subsetPermissionRules.action);
    } else {
      subsetPermissionRules.action.forEach((subsetPermissionAction) => {
        subsetPermissionActions.push(subsetPermissionAction);
      });
    }
    subsetPermissionActions = subsetPermissionActions.filter(
      (el) => !checkedPermissionRules.has(getPermissionSetContainerID(el, subsetPermissionSubject))
    );

    // eslint-disable-next-line no-continue
    if (!subsetPermissionActions.length) continue;
    // eslint-disable-next-line no-unreachable-loop
    for (const subsetPermissionAction of subsetPermissionActions) {
      const parentSetRulesOfSubset = parentSetPermissions.possibleRulesFor(
        subsetPermissionAction,
        subsetPermissionSubject
      );
      const nonInveretedOnes = parentSetRulesOfSubset.filter((el) => !el.inverted);
      if (!nonInveretedOnes.length) return false;

      const subsetRules = subsetPermissions.possibleRulesFor(subsetPermissionAction, subsetPermissionSubject);
      const isSubset = isSubsetForSamePermissionSubjectAction(parentSetRulesOfSubset, subsetRules);
      if (!isSubset) return false;
    }

    subsetPermissionActions.forEach((el) =>
      checkedPermissionRules.add(getPermissionSetContainerID(el, subsetPermissionSubject))
    );
  }

  return true;
};

const superset = createMongoAbility([
  {
    action: ["create", "edit", "delete", "read"],
    subject: "secrets",
    conditions: {
      environment: { [PermissionConditionOperators.$EQ]: "dev" }
    }
  },
  {
    action: "read",
    subject: "secrets",
    inverted: true,
    conditions: {
      environment: { [PermissionConditionOperators.$EQ]: "dev" },
      secretPath: { [PermissionConditionOperators.$GLOB]: "/hello" }
    }
  }
]);

const subset = createMongoAbility([
  {
    action: "edit",
    subject: "secrets",
    conditions: {
      environment: { [PermissionConditionOperators.$EQ]: "dev" },
      secretPath: { [PermissionConditionOperators.$EQ]: "/hello" }
    }
  }
]);

console.log(isAtLeastAsPrivileged(superset, subset));
