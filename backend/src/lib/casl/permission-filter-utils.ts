import type { MongoAbility, MongoQuery, RawRuleOf } from "@casl/ability";
import RE2 from "re2";

import { BadRequestError } from "@app/lib/errors";

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
  /**
   * Metadata $elemMatch conditions extracted from the matching rules, ready
   * to be passed to applyMetadataFilter. Each entry ANDs with the others when
   * applied. Multi-rule semantics: CASL would OR multiple allow rules, but
   * applyMetadataFilter ANDs entries together — we intentionally AND here as
   * it's stricter (smaller result set, no leaks). A warning is logged when
   * more than one allow rule on the same subject contributes $elemMatch
   * entries so the deviation is observable.
   */
  metadataFilter: Array<{ key: string; value?: string }>;
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

const RECOGNIZED_OPERATORS = new Set(["$regex", "$eq", "$in", "$glob", "$ne", "$elemMatch"]);

/**
 * Extract metadata $elemMatch entries (compatible with applyMetadataFilter)
 * from a CASL condition value. Only $eq and $in are permitted under the
 * inner `key` / `value` objects (matching the schemas in project-permission.ts).
 * Any other operator throws loudly so the translator can't silently drop
 * security-relevant conditions.
 */
const extractElemMatchEntries = (field: string, elemMatchValue: unknown): Array<{ key: string; value?: string }> => {
  if (!elemMatchValue || typeof elemMatchValue !== "object") {
    throw new BadRequestError({
      message: `Invalid $elemMatch value for field "${field}" — expected an object.`
    });
  }

  const inner = elemMatchValue as Record<string, unknown>;
  const keySpec = inner.key as Record<string, unknown> | undefined;
  const valueSpec = inner.value as Record<string, unknown> | undefined;

  const readOperand = (
    innerField: "key" | "value",
    spec: Record<string, unknown> | undefined
  ): string[] | undefined => {
    if (spec === undefined) return undefined;
    if (!spec || typeof spec !== "object") {
      throw new BadRequestError({
        message: `Invalid $elemMatch.${innerField} for field "${field}" — expected an object.`
      });
    }
    const allowed = new Set(["$eq", "$in"]);
    const ops = Object.keys(spec).filter((k) => k.startsWith("$"));
    for (const op of ops) {
      if (!allowed.has(op)) {
        throw new BadRequestError({
          message: `Unknown CASL operator "${op}" under $elemMatch.${innerField} on field "${field}" — only $eq/$in are supported.`
        });
      }
    }
    const results: string[] = [];
    if ("$eq" in spec) {
      results.push(String(spec.$eq));
    }
    if ("$in" in spec) {
      const arr = spec.$in;
      if (!Array.isArray(arr)) {
        throw new BadRequestError({
          message: `Invalid $elemMatch.${innerField}.$in for field "${field}" — expected array.`
        });
      }
      arr.forEach((v) => results.push(String(v)));
    }
    // No recognized operator under elemMatch — treat as no constraint.
    return results.length > 0 ? results : undefined;
  };

  const keys = readOperand("key", keySpec);
  const values = readOperand("value", valueSpec);

  if (!keys || keys.length === 0) {
    // Every entry needs a key; otherwise applyMetadataFilter has nothing to
    // join on. This matches what the schema requires in practice.
    throw new BadRequestError({
      message: `$elemMatch on field "${field}" must specify a key constraint.`
    });
  }

  if (!values) {
    return keys.map((key) => ({ key }));
  }

  const entries: Array<{ key: string; value?: string }> = [];
  keys.forEach((key) => {
    values.forEach((value) => {
      entries.push({ key, value });
    });
  });
  return entries;
};

/**
 * Builds permission filters from CASL MongoDB-style conditions
 * @param conditions - MongoDB-style conditions from CASL ability
 * @param isInverted - Whether this rule is inverted (forbidden)
 * @returns Record of field names to arrays of filter configurations, plus the
 *          metadata $elemMatch entries extracted for the service layer.
 */
const buildPermissionFiltersFromConditions = (
  conditions: MongoQuery,
  isInverted = false
): { permissionFilters: PermissionFilters; metadataFilter: Array<{ key: string; value?: string }> } => {
  const permissionFilters: PermissionFilters = {};
  const metadataFilter: Array<{ key: string; value?: string }> = [];

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

      // $elemMatch handled via the service layer (applyMetadataFilter), not
      // via SQL translation. Extract entries even in the multi-operator case,
      // though our schemas never mix $elemMatch with anything else.
      if ("$elemMatch" in valueObj) {
        if (isInverted) {
          throw new BadRequestError({
            message: `Inverted rules with $elemMatch on field "${key}" are not supported.`
          });
        }
        const entries = extractElemMatchEntries(key, valueObj.$elemMatch);
        metadataFilter.push(...entries);
        // If the value is only $elemMatch, we're done. If it had other
        // recognized operators, keep processing them below.
        const otherPresent = presentOperators.length > 0;
        if (!otherPresent) return;
      }

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
      } else {
        // Guardrail: If the value looks like a CASL operator object (has
        // $-prefixed keys) but none of them are recognized, fail loudly
        // instead of silently dropping the condition. This is what bit us
        // with $elemMatch originally.
        const dollarKeys = Object.keys(valueObj).filter((k) => k.startsWith("$"));
        if (dollarKeys.length > 0) {
          const unknown = dollarKeys.find((k) => !RECOGNIZED_OPERATORS.has(k));
          if (unknown) {
            throw new BadRequestError({
              message: `Unknown CASL operator "${unknown}" on field "${key}" — translator is missing a handler.`
            });
          }
        }
        // Otherwise it's a plain nested object — ignore (prior behavior).
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

  return { permissionFilters, metadataFilter };
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
  const metadataFilter: Array<{ key: string; value?: string }> = [];
  let allowRulesWithMetadata = 0;

  matchingRules.forEach((rule: RawRuleOf<MongoAbility>) => {
    if (rule.conditions) {
      const isInverted = rule.inverted || false;
      const { permissionFilters, metadataFilter: ruleMetadata } = buildPermissionFiltersFromConditions(
        rule.conditions,
        isInverted
      );

      if (isInverted) {
        forbidRules.push(permissionFilters);
      } else {
        allowRules.push(permissionFilters);
        if (ruleMetadata.length > 0) {
          allowRulesWithMetadata += 1;
          metadataFilter.push(...ruleMetadata);
        }
      }
    }
  });

  if (allowRulesWithMetadata > 1) {
    // eslint-disable-next-line no-console
    console.warn(
      `[permission-filter-utils] ${allowRulesWithMetadata} allow rules with metadata $elemMatch conditions detected on ` +
        `subject "${subjectName}" / action "${action}". Entries will be AND-ed (stricter than CASL's OR semantics).`
    );
  }

  return { allowRules, forbidRules, metadataFilter };
}
