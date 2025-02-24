import { MongoAbility } from "@casl/ability";
import { MongoQuery } from "@ucast/mongo2js";
import picomatch from "picomatch";

import { PermissionConditionOperators } from "./index";

type TMissingPermission = {
  action: string;
  subject: string;
  conditions?: MongoQuery;
};

type TPermissionConditionShape = {
  [PermissionConditionOperators.$EQ]: string;
  [PermissionConditionOperators.$NEQ]: string;
  [PermissionConditionOperators.$GLOB]: string;
  [PermissionConditionOperators.$IN]: string[];
};

const getPermissionSetID = (action: string, subject: string) => `${action}:${subject}`;
const invertTheOperation = (shouldInvert: boolean, operation: boolean) => (shouldInvert ? !operation : operation);
const formatConditionOperator = (condition: TPermissionConditionShape | string) => {
  return (
    typeof condition === "string" ? { [PermissionConditionOperators.$EQ]: condition } : condition
  ) as TPermissionConditionShape;
};

const isOperatorsASubset = (parentSet: TPermissionConditionShape, subset: TPermissionConditionShape) => {
  // we compute each operator against each other in left hand side and right hand side
  if (subset[PermissionConditionOperators.$EQ] || subset[PermissionConditionOperators.$NEQ]) {
    const subsetOperatorValue = subset[PermissionConditionOperators.$EQ] || subset[PermissionConditionOperators.$NEQ];
    const isInverted = !subset[PermissionConditionOperators.$EQ];
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
    // ne and glob cannot match each other
    if (parentSet[PermissionConditionOperators.$GLOB] && isInverted) {
      return false;
    }
    if (
      parentSet[PermissionConditionOperators.$GLOB] &&
      !picomatch.isMatch(subsetOperatorValue, parentSet[PermissionConditionOperators.$GLOB], { strictSlashes: false })
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
      subsetOperatorValue.includes(parentSet[PermissionConditionOperators.$NEQ])
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
  parentSetRules: ReturnType<MongoAbility["possibleRulesFor"]>,
  subsetRules: ReturnType<MongoAbility["possibleRulesFor"]>,
  appendToMissingPermission: (condition?: MongoQuery) => void
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
    const isSubset = isSubsetOfNonInvertedParentSet && isNotSubsetOfInvertedParentSet;
    if (!isSubset) {
      appendToMissingPermission(subsetRule.conditions);
    }
    return isSubset;
  });
};

export const validatePermissionBoundary = (parentSetPermissions: MongoAbility, subsetPermissions: MongoAbility) => {
  const checkedPermissionRules = new Set<string>();
  const missingPermissions: TMissingPermission[] = [];

  subsetPermissions.rules.forEach((subsetPermissionRules) => {
    const subsetPermissionSubject = subsetPermissionRules.subject.toString();
    let subsetPermissionActions: string[] = [];

    // actions can be string or string[]
    if (typeof subsetPermissionRules.action === "string") {
      subsetPermissionActions.push(subsetPermissionRules.action);
    } else {
      subsetPermissionRules.action.forEach((subsetPermissionAction) => {
        subsetPermissionActions.push(subsetPermissionAction);
      });
    }

    // if action is already processed ignore
    subsetPermissionActions = subsetPermissionActions.filter(
      (el) => !checkedPermissionRules.has(getPermissionSetID(el, subsetPermissionSubject))
    );

    if (!subsetPermissionActions.length) return;
    subsetPermissionActions.forEach((subsetPermissionAction) => {
      const parentSetRulesOfSubset = parentSetPermissions.possibleRulesFor(
        subsetPermissionAction,
        subsetPermissionSubject
      );
      const nonInveretedOnes = parentSetRulesOfSubset.filter((el) => !el.inverted);
      if (!nonInveretedOnes.length) {
        missingPermissions.push({ action: subsetPermissionAction, subject: subsetPermissionSubject });
        return;
      }

      const subsetRules = subsetPermissions.possibleRulesFor(subsetPermissionAction, subsetPermissionSubject);
      isSubsetForSamePermissionSubjectAction(parentSetRulesOfSubset, subsetRules, (conditions) => {
        missingPermissions.push({ action: subsetPermissionAction, subject: subsetPermissionSubject, conditions });
      });
    });

    subsetPermissionActions.forEach((el) =>
      checkedPermissionRules.add(getPermissionSetID(el, subsetPermissionSubject))
    );
  });

  if (missingPermissions.length) {
    return { isValid: false as const, missingPermissions };
  }

  return { isValid: true };
};
