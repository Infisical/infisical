import type { MongoAbility, MongoQuery, RawRuleOf } from "@casl/ability";
import RE2 from "re2";

export interface PermissionFilterConfig {
  operator: string;
  value: unknown;
  isPattern: boolean;
  isInverted?: boolean;
}

export type PermissionFilters = Record<string, Array<PermissionFilterConfig>>;

export interface ProcessedPermissionRules {
  allowRules: Array<Record<string, Array<PermissionFilterConfig>>>;
  forbidRules: Array<Record<string, Array<PermissionFilterConfig>>>;
}

interface MongoRegexFilter {
  $regex: RegExp;
}

interface MongoEqFilter {
  $eq: unknown;
}

interface MongoInFilter {
  $in: unknown[];
}

interface MongoNeFilter {
  $ne: unknown;
}

interface MongoGlobFilter {
  $glob: unknown;
}

/**
 * Builds permission filters from CASL MongoDB-style conditions
 * @param conditions - MongoDB-style conditions from CASL ability
 * @param isInverted - Whether this rule is inverted (forbidden)
 * @returns Record of field names to arrays of filter configurations
 */
const buildPermissionFiltersFromConditions = (conditions: MongoQuery, isInverted = false): PermissionFilters => {
  const permissionFilters: PermissionFilters = {};

  function addFilterToField(key: string, operator: string, value: unknown, isPattern: boolean) {
    if (!permissionFilters[key]) {
      permissionFilters[key] = [];
    }

    // Convert operators for inverted/forbidden rules
    let finalOperator = operator;
    if (isInverted) {
      switch (operator) {
        case "=":
          finalOperator = "!=";
          break;
        case "!=":
          finalOperator = "=";
          break;
        case "LIKE":
          finalOperator = "NOT LIKE";
          break;
        case "NOT LIKE":
          finalOperator = "LIKE";
          break;
        case "IN":
          finalOperator = "NOT IN";
          break;
        case "NOT IN":
          finalOperator = "IN";
          break;
        case ">":
          finalOperator = "<=";
          break;
        case ">=":
          finalOperator = "<";
          break;
        case "<":
          finalOperator = ">=";
          break;
        case "<=":
          finalOperator = ">";
          break;
        case "IS NULL":
          finalOperator = "IS NOT NULL";
          break;
        case "IS NOT NULL":
          finalOperator = "IS NULL";
          break;
        // Default: keep the same operator
        default:
          finalOperator = operator;
          break;
      }
    }

    permissionFilters[key].push({ operator: finalOperator, value, isPattern, isInverted });
  }

  function processCondition(key: string, value: unknown) {
    if (value && typeof value === "object") {
      const valueObj = value as Record<string, unknown>;

      const operatorKeys = ["$regex", "$eq", "$in", "$glob", "$ne"];
      const presentOperators = operatorKeys.filter((op) => op in valueObj);

      if (presentOperators.length > 1) {
        if ("$eq" in valueObj) {
          addFilterToField(key, "=", valueObj.$eq, false);
        }
        if ("$glob" in valueObj) {
          addFilterToField(key, "LIKE", valueObj.$glob, true);
        }
        if ("$regex" in valueObj) {
          const regexValue = valueObj.$regex as RegExp;
          const regexPattern = regexValue.source;
          const globPattern = regexPattern
            .replace(new RE2("^\\\\\\^"), "")
            .replace(new RE2("\\\\\\$$"), "")
            .replace(new RE2("\\\\\\.\\*", "g"), "*");
          addFilterToField(key, "LIKE", globPattern, true);
        }
        if ("$ne" in valueObj) {
          const valueStr = String(valueObj.$ne);
          const hasWildcards = valueStr.includes("*") || valueStr.includes("?");
          addFilterToField(key, hasWildcards ? "NOT LIKE" : "!=", valueObj.$ne, hasWildcards);
        }
        if ("$in" in valueObj) {
          const inValues = valueObj.$in as unknown[];
          addFilterToField(key, "IN", inValues, false);
        }
      } else if ("$regex" in value) {
        const regexFilter = value as MongoRegexFilter;
        const regexPattern = regexFilter.$regex.source;
        const globPattern = regexPattern
          .replace(new RE2("^\\\\\\^"), "")
          .replace(new RE2("\\\\\\$$"), "")
          .replace(new RE2("\\\\\\.\\*", "g"), "*");
        addFilterToField(key, "LIKE", globPattern, true);
      } else if ("$eq" in value) {
        const eqFilter = value as MongoEqFilter;
        addFilterToField(key, "=", eqFilter.$eq, false);
      } else if ("$in" in value) {
        const inFilter = value as MongoInFilter;
        addFilterToField(key, "IN", inFilter.$in, false);
      } else if ("$glob" in value) {
        const globFilter = value as MongoGlobFilter;
        addFilterToField(key, "LIKE", globFilter.$glob, true);
      } else if ("$ne" in value) {
        const neFilter = value as MongoNeFilter;
        const valueStr = String(neFilter.$ne);
        const hasWildcards = valueStr.includes("*") || valueStr.includes("?");
        addFilterToField(key, hasWildcards ? "NOT LIKE" : "!=", neFilter.$ne, hasWildcards);
      }
    } else {
      addFilterToField(key, "=", value, false);
    }
  }

  function processConditions(mongoConditions: MongoQuery) {
    if (
      mongoConditions &&
      typeof mongoConditions === "object" &&
      "$or" in mongoConditions &&
      Array.isArray(mongoConditions.$or)
    ) {
      mongoConditions.$or.forEach((orCondition: MongoQuery) => {
        processConditions(orCondition);
      });
    } else if (mongoConditions && typeof mongoConditions === "object") {
      Object.entries(mongoConditions).forEach(([key, value]) => {
        if (key.startsWith("$")) return;
        processCondition(key, value);
      });
    }
  }

  if (conditions && typeof conditions === "object") {
    processConditions(conditions);
  }

  return permissionFilters;
};

/**
 * Extract permission filters for a subject and action,
 * converting them into ProcessedPermissionRules format for use with Knex queries.
 * @param ability - CASL MongoAbility instance
 * @param action - Permission action to filter for
 * @param subjectName - Permission subject to filter for
 * @returns ProcessedPermissionRules object for use with applyPermissionFiltersToQuery
 */
export function getProcessedPermissionRules(
  ability: MongoAbility,
  action: string,
  subjectName: string
): ProcessedPermissionRules {
  const matchingRules = ability.rules.filter((rule: RawRuleOf<MongoAbility>) => {
    const actionMatches = Array.isArray(rule.action) ? rule.action.includes(action) : rule.action === action;
    const subjectMatches = Array.isArray(rule.subject)
      ? rule.subject.includes(subjectName)
      : rule.subject === subjectName;
    return actionMatches && subjectMatches && rule.conditions;
  });

  const allowRules: Array<Record<string, Array<PermissionFilterConfig>>> = [];
  const forbidRules: Array<Record<string, Array<PermissionFilterConfig>>> = [];

  matchingRules.forEach((rule: RawRuleOf<MongoAbility>) => {
    if (rule.conditions) {
      const isInverted = rule.inverted || false;
      const ruleFilters = buildPermissionFiltersFromConditions(rule.conditions, isInverted);

      if (isInverted) {
        forbidRules.push(ruleFilters);
      } else {
        allowRules.push(ruleFilters);
      }
    }
  });

  return { allowRules, forbidRules };
}
