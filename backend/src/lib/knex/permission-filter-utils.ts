import type { Knex } from "knex";
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

/**
 * Applies permission filters to a Knex query for any table
 * @param query - The Knex query builder instance
 * @param tableName - The name of the table to apply filters to
 * @param permissionFilters - Record of field names to arrays of filter configurations
 * @returns The modified query builder with permission filters applied
 */
export const applyPermissionFiltersToQuery = (
  originalQuery: Knex.QueryBuilder,
  tableName: string,
  permissionFilters?: PermissionFilters
): Knex.QueryBuilder => {
  if (!permissionFilters) {
    return originalQuery;
  }

  let query = originalQuery;

  Object.entries(permissionFilters).forEach(([key, filterConfigs]) => {
    filterConfigs.forEach((filterConfig) => {
      if (filterConfig.value !== undefined && filterConfig.value !== null) {
        const { operator, value, isPattern } = filterConfig;
        const fieldName = `${tableName}.${key}`;

        switch (operator) {
          case "=":
            query = query.andWhere(fieldName, "=", value as string | number);
            break;
          case "!=":
            query = query.andWhere(fieldName, "!=", value as string | number);
            break;
          case "LIKE": {
            const likePattern = isPattern ? String(value).replace(new RE2("\\*", "g"), "%") : String(value);
            query = query.andWhere(fieldName, "like", likePattern);
            break;
          }
          case "NOT LIKE": {
            const notLikePattern = isPattern ? String(value).replace(new RE2("\\*", "g"), "%") : String(value);
            query = query.andWhere(fieldName, "not like", notLikePattern);
            break;
          }
          case "IN": {
            const inValues = Array.isArray(value) ? value : [value];
            query = query.andWhere(fieldName, "in", inValues as (string | number)[]);
            break;
          }
          case "NOT IN": {
            const notInValues = Array.isArray(value) ? value : [value];
            query = query.andWhere(fieldName, "not in", notInValues as (string | number)[]);
            break;
          }
          case ">":
            query = query.andWhere(fieldName, ">", value as string | number);
            break;
          case ">=":
            query = query.andWhere(fieldName, ">=", value as string | number);
            break;
          case "<":
            query = query.andWhere(fieldName, "<", value as string | number);
            break;
          case "<=":
            query = query.andWhere(fieldName, "<=", value as string | number);
            break;
          case "IS NULL":
            query = query.andWhere(fieldName, "is", null);
            break;
          case "IS NOT NULL":
            query = query.andWhere(fieldName, "is not", null);
            break;
          default:
            query = query.andWhere(fieldName, "=", value as string | number);
            break;
        }
      }
    });
  });

  return query;
};

/**
 * Applies a single filter configuration to a query
 * @param query - The Knex query builder instance
 * @param tableName - The name of the table to apply filters to
 * @param key - The field name
 * @param filterConfig - The filter configuration
 */
const applySingleFilter = (
  query: Knex.QueryBuilder,
  tableName: string,
  key: string,
  filterConfig: PermissionFilterConfig
): void => {
  if (filterConfig.value !== undefined && filterConfig.value !== null) {
    const { operator, value, isPattern } = filterConfig;
    const fieldName = `${tableName}.${key}`;

    switch (operator) {
      case "=":
        void query.andWhere(fieldName, "=", value as string | number);
        break;
      case "!=":
        void query.andWhere(fieldName, "!=", value as string | number);
        break;
      case "LIKE": {
        const likePattern = isPattern ? String(value).replace(new RE2("\\*", "g"), "%") : String(value);
        void query.andWhere(fieldName, "like", likePattern);
        break;
      }
      case "NOT LIKE": {
        const notLikePattern = isPattern ? String(value).replace(new RE2("\\*", "g"), "%") : String(value);
        void query.andWhere(fieldName, "not like", notLikePattern);
        break;
      }
      case "IN": {
        const inValues = Array.isArray(value) ? value : [value];
        void query.andWhere(fieldName, "in", inValues as (string | number)[]);
        break;
      }
      case "NOT IN": {
        const notInValues = Array.isArray(value) ? value : [value];
        void query.andWhere(fieldName, "not in", notInValues as (string | number)[]);
        break;
      }
      case ">":
        void query.andWhere(fieldName, ">", value as string | number);
        break;
      case ">=":
        void query.andWhere(fieldName, ">=", value as string | number);
        break;
      case "<":
        void query.andWhere(fieldName, "<", value as string | number);
        break;
      case "<=":
        void query.andWhere(fieldName, "<=", value as string | number);
        break;
      case "IS NULL":
        void query.andWhere(fieldName, "is", null);
        break;
      case "IS NOT NULL":
        void query.andWhere(fieldName, "is not", null);
        break;
      default:
        void query.andWhere(fieldName, "=", value as string | number);
        break;
    }
  }
};

/**
 * Applies complex permission rules to a Knex query with proper OR/AND logic
 * @param query - The Knex query builder instance
 * @param tableName - The name of the table to apply filters to
 * @param processedRules - Processed permission rules with allow and forbid rules
 * @returns The modified query builder with permission rules applied
 */
export const applyProcessedPermissionRulesToQuery = (
  originalQuery: Knex.QueryBuilder,
  tableName: string,
  processedRules?: ProcessedPermissionRules
): Knex.QueryBuilder => {
  if (!processedRules || (processedRules.allowRules.length === 0 && processedRules.forbidRules.length === 0)) {
    return originalQuery;
  }

  let query = originalQuery;

  if (processedRules.allowRules.length > 0) {
    query = query.andWhere((allowBuilder) => {
      processedRules.allowRules.forEach((rule, index) => {
        const ruleBuilder = (ruleSubBuilder: Knex.QueryBuilder) => {
          Object.entries(rule).forEach(([key, filterConfigs]) => {
            filterConfigs.forEach((filterConfig) => {
              applySingleFilter(ruleSubBuilder, tableName, key, filterConfig);
            });
          });
        };

        if (index === 0) {
          void allowBuilder.where(ruleBuilder);
        } else {
          void allowBuilder.orWhere(ruleBuilder);
        }
      });
    });
  }

  if (processedRules.forbidRules.length > 0) {
    processedRules.forbidRules.forEach((forbidRule) => {
      query = query.andWhere((forbidBuilder) => {
        let hasConditions = false;
        Object.entries(forbidRule).forEach(([key, filterConfigs]) => {
          filterConfigs.forEach((filterConfig) => {
            const negatedConfig = { ...filterConfig };

            switch (filterConfig.operator) {
              case "=":
                negatedConfig.operator = "!=";
                break;
              case "!=":
                negatedConfig.operator = "=";
                break;
              case "LIKE":
                negatedConfig.operator = "NOT LIKE";
                break;
              case "NOT LIKE":
                negatedConfig.operator = "LIKE";
                break;
              case "IN":
                negatedConfig.operator = "NOT IN";
                break;
              case "NOT IN":
                negatedConfig.operator = "IN";
                break;
              case ">":
                negatedConfig.operator = "<=";
                break;
              case ">=":
                negatedConfig.operator = "<";
                break;
              case "<":
                negatedConfig.operator = ">=";
                break;
              case "<=":
                negatedConfig.operator = ">";
                break;
              case "IS NULL":
                negatedConfig.operator = "IS NOT NULL";
                break;
              case "IS NOT NULL":
                negatedConfig.operator = "IS NULL";
                break;
              default:
                negatedConfig.operator = "!=";
                break;
            }

            if (hasConditions) {
              void forbidBuilder.orWhere((subBuilder) => {
                applySingleFilter(subBuilder, tableName, key, negatedConfig);
              });
            } else {
              void forbidBuilder.where((subBuilder) => {
                applySingleFilter(subBuilder, tableName, key, negatedConfig);
              });
              hasConditions = true;
            }
          });
        });
      });
    });
  }

  return query;
};

/**
 * Sanitizes a string value for safe use in SQL LIKE queries
 * @param value - The string value to sanitize
 * @returns The sanitized string with SQL special characters escaped
 */
export const sanitizeForLike = (value: string): string => {
  return String(value).replace(new RE2("[%_\\\\]", "g"), "\\$&");
};
