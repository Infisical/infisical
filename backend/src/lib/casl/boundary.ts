import { MongoAbility } from "@casl/ability";
import { MongoQuery } from "@ucast/mongo2js";
import picomatch from "picomatch";

import { haveDisjointLiteralPrefixes, isGlobSubsetOfGlob } from "./glob-subset";
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

    if (isInverted && (parentSet[PermissionConditionOperators.$EQ] || parentSet[PermissionConditionOperators.$IN])) {
      return false;
    }

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
      !isGlobSubsetOfGlob(parentSet[PermissionConditionOperators.$GLOB], subsetOperatorValue)
    ) {
      return false;
    }
  }
  return true;
};

/**
 * Returns true if we can prove the two operator constraints define disjoint match sets (share no
 * elements). Returns false when uncertain — callers should treat that as "potentially overlapping"
 * and behave conservatively. Used by the inverted (deny) rule overlap check.
 */
const areOperatorsDisjoint = (a: TPermissionConditionShape, b: TPermissionConditionShape): boolean => {
  const aEq = a[PermissionConditionOperators.$EQ];
  const aNeq = a[PermissionConditionOperators.$NEQ];
  const aIn = a[PermissionConditionOperators.$IN];
  const aGlob = a[PermissionConditionOperators.$GLOB];
  const bEq = b[PermissionConditionOperators.$EQ];
  const bNeq = b[PermissionConditionOperators.$NEQ];
  const bIn = b[PermissionConditionOperators.$IN];
  const bGlob = b[PermissionConditionOperators.$GLOB];

  if (aEq !== undefined && bEq !== undefined) return aEq !== bEq;
  if (aEq !== undefined && bNeq !== undefined) return aEq === bNeq;
  if (bEq !== undefined && aNeq !== undefined) return bEq === aNeq;
  if (aEq !== undefined && bIn !== undefined) return !bIn.includes(aEq);
  if (bEq !== undefined && aIn !== undefined) return !aIn.includes(bEq);
  if (aEq !== undefined && bGlob !== undefined) {
    return !picomatch.isMatch(aEq, bGlob, { strictSlashes: false });
  }
  if (bEq !== undefined && aGlob !== undefined) {
    return !picomatch.isMatch(bEq, aGlob, { strictSlashes: false });
  }

  if (aIn !== undefined && bIn !== undefined) {
    return !aIn.some((v) => bIn.includes(v));
  }
  if (aIn !== undefined && bGlob !== undefined) {
    return !aIn.some((v) => picomatch.isMatch(v, bGlob, { strictSlashes: false }));
  }
  if (bIn !== undefined && aGlob !== undefined) {
    return !bIn.some((v) => picomatch.isMatch(v, aGlob, { strictSlashes: false }));
  }
  // $in vs $neq: disjoint if every $in value is excluded by $neq (i.e., equals the $neq value).
  if (aIn !== undefined && bNeq !== undefined) return aIn.every((v) => v === bNeq);
  if (bIn !== undefined && aNeq !== undefined) return bIn.every((v) => v === aNeq);

  if (aGlob !== undefined && bGlob !== undefined) {
    return haveDisjointLiteralPrefixes(aGlob, bGlob);
  }

  // $glob vs $neq: $glob covers a (typically infinite) set; $neq excludes one value. Probably
  // disjoint only if the glob is exactly the excluded value as a literal string.
  if (aGlob !== undefined && bNeq !== undefined) return aGlob === bNeq;
  if (bGlob !== undefined && aNeq !== undefined) return bGlob === aNeq;

  // Two $neq constraints almost always overlap over an infinite string domain.
  return false;
};

const isSubsetForSamePermissionSubjectAction = (
  parentSetRules: ReturnType<MongoAbility["possibleRulesFor"]>,
  subsetRules: ReturnType<MongoAbility["possibleRulesFor"]>,
  appendToMissingPermission: (condition?: MongoQuery) => void
) => {
  // Fast path: if every NON-inverted parent rule is unconditional and there are no inverted
  // rules, the parent grants the action universally
  const hasOnlyUnconditionalNonInvertedRules =
    parentSetRules.length > 0 && parentSetRules.every((el) => !el.inverted && !el.conditions);
  if (hasOnlyUnconditionalNonInvertedRules) return true;

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
    // A subset is invalid if it overlaps any inverted (deny) parent rule. Since conditions are
    // AND-of-fields, proving any single field disjoint between the subset and the deny rule is
    // enough to prove non-overlap.
    const overlapsWithInvertedParent = (invertedConditions: Record<string, TPermissionConditionShape | string>) => {
      const fields = Object.keys(invertedConditions);
      for (const field of fields) {
        const subsetField = subsetRuleConditions?.[field];
        // If the subset doesn't constrain this field, it matches every value and inevitably
        // overlaps the deny region for this field — leave the field unproven and check the next.
        if (subsetField) {
          const invertedOps = formatConditionOperator(invertedConditions[field]);
          const subsetOps = formatConditionOperator(subsetField);
          if (areOperatorsDisjoint(invertedOps, subsetOps)) return false;
        }
      }
      return true;
    };
    const isNotInDeniedRegion = invertedParentSetRules.length
      ? !invertedParentSetRules.some((parentSetRule) => {
          const parentSetRuleConditions = parentSetRule?.conditions as Record<
            string,
            TPermissionConditionShape | string
          >;
          // Unconditional inverted rule denies everything; any subset overlaps it.
          if (!parentSetRuleConditions) return true;
          return overlapsWithInvertedParent(parentSetRuleConditions);
        })
      : true;
    const isSubset = isSubsetOfNonInvertedParentSet && isNotInDeniedRegion;
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
