import { Knex } from "knex";
import RE2 from "re2";

import { TableName } from "@app/db/schemas/models";
import { logger } from "@app/lib/logger";

import { PkiFilterField, PkiFilterOperator, TPkiFilterRule } from "./pki-alert-v2-types";

export const sanitizeLikeInput = (input: string): string => {
  const allowedCharsRegex = new RE2("^[a-zA-Z0-9\\s\\-_\\.@\\*]+$");
  if (!allowedCharsRegex.test(input)) {
    throw new Error(
      "Invalid characters in input. Only alphanumeric characters, spaces, hyphens, underscores, dots, @ and * are allowed."
    );
  }

  const backslashRegex = new RE2("\\\\", "g");
  const percentRegex = new RE2("%", "g");
  const underscoreRegex = new RE2("_", "g");
  const quoteRegex = new RE2("'", "g");

  return input
    .replace(backslashRegex, "\\\\\\\\")
    .replace(percentRegex, "\\%")
    .replace(underscoreRegex, "\\_")
    .replace(quoteRegex, "''");
};

export const parseTimeToPostgresInterval = (duration: string): string => {
  if (duration.length > 32) {
    throw new Error(`Invalid duration format: ${duration}. Use format like '30d', '1w', '3m', '1y'`);
  }

  const durationRegex = new RE2("^(\\d+)([dwmy])$");
  const match = durationRegex.exec(duration);

  if (!match) {
    throw new Error(`Invalid duration format: ${duration}. Use format like '30d', '1w', '3m', '1y'`);
  }

  const [, value, unit] = match;
  const amount = parseInt(value, 10);

  if (amount <= 0 || amount > 9999) {
    throw new Error(`Duration value out of range: ${duration}. Must be between 1 and 9999.`);
  }

  const unitMap = {
    d: "days",
    w: "weeks",
    m: "months",
    y: "years"
  };

  return `${amount} ${unitMap[unit as keyof typeof unitMap]}`;
};

export const parseTimeToDays = (timeStr: string): number => {
  const alertBeforeRegex = new RE2("^(\\d+)([dwmy])$");
  const match = alertBeforeRegex.exec(timeStr);
  if (!match) {
    return 0;
  }

  const [, value, unit] = match;
  const amount = parseInt(value, 10);

  if (amount <= 0 || amount > 9999) {
    return 0;
  }

  switch (unit) {
    case "d":
      return amount;
    case "w":
      return amount * 7;
    case "m":
      return amount * 30;
    case "y":
      return amount * 365;
    default:
      return 0;
  }
};

const applyProfileNameFilter = (query: Knex.QueryBuilder, filter: TPkiFilterRule): Knex.QueryBuilder => {
  const { value } = filter;

  switch (filter.operator) {
    case PkiFilterOperator.EQUALS:
      return query.where("profile.slug", value as string);

    case PkiFilterOperator.MATCHES:
      if (Array.isArray(value)) {
        return query.whereIn("profile.slug", value);
      }
      return query.whereILike("profile.slug", `%${sanitizeLikeInput(String(value))}%`);

    case PkiFilterOperator.CONTAINS:
      if (Array.isArray(value)) {
        return query.where((builder) => {
          value.forEach((v, index) => {
            const sanitizedValue = sanitizeLikeInput(String(v));
            if (index === 0) {
              void builder.whereILike("profile.slug", `%${sanitizedValue}%`);
            } else {
              void builder.orWhereILike("profile.slug", `%${sanitizedValue}%`);
            }
          });
        });
      }
      return query.whereILike("profile.slug", `%${sanitizeLikeInput(String(value))}%`);

    case PkiFilterOperator.STARTS_WITH:
      return query.whereILike("profile.slug", `${sanitizeLikeInput(String(value))}%`);

    case PkiFilterOperator.ENDS_WITH:
      return query.whereILike("profile.slug", `%${sanitizeLikeInput(String(value))}`);

    default:
      logger.warn(`Unsupported operator for profile_name: ${String(filter.operator)}`);
      return query;
  }
};

const applyCommonNameFilter = (query: Knex.QueryBuilder, filter: TPkiFilterRule): Knex.QueryBuilder => {
  const { value } = filter;
  const columnName = `${TableName.Certificate}.commonName`;

  switch (filter.operator) {
    case PkiFilterOperator.EQUALS:
      return query.where(columnName, value as string);

    case PkiFilterOperator.MATCHES:
      if (Array.isArray(value)) {
        return query.whereIn(columnName, value);
      }
      return query.whereILike(columnName, `%${sanitizeLikeInput(String(value))}%`);

    case PkiFilterOperator.CONTAINS:
      if (Array.isArray(value)) {
        return query.where((builder) => {
          value.forEach((v, index) => {
            const sanitizedValue = sanitizeLikeInput(String(v));
            if (index === 0) {
              void builder.whereILike(columnName, `%${sanitizedValue}%`);
            } else {
              void builder.orWhereILike(columnName, `%${sanitizedValue}%`);
            }
          });
        });
      }
      return query.whereILike(columnName, `%${sanitizeLikeInput(String(value))}%`);

    case PkiFilterOperator.STARTS_WITH:
      return query.whereILike(columnName, `${sanitizeLikeInput(String(value))}%`);

    case PkiFilterOperator.ENDS_WITH:
      return query.whereILike(columnName, `%${sanitizeLikeInput(String(value))}`);

    default:
      logger.warn(`Unsupported operator for common_name: ${String(filter.operator)}`);
      return query;
  }
};

const applySanFilter = (query: Knex.QueryBuilder, filter: TPkiFilterRule): Knex.QueryBuilder => {
  const { value } = filter;
  const columnName = `${TableName.Certificate}.altNames`;

  switch (filter.operator) {
    case PkiFilterOperator.EQUALS:
      return query.whereJsonSupersetOf(columnName, [value as string]);

    case PkiFilterOperator.MATCHES:
      if (Array.isArray(value)) {
        return query.where((builder) => {
          value.forEach((v, index) => {
            const sanitizedValue = `%"${String(v)}"%`;
            if (index === 0) {
              void builder.whereRaw(`??."altNames"::text ILIKE ?`, [TableName.Certificate, sanitizedValue]);
            } else {
              void builder.orWhereRaw(`??."altNames"::text ILIKE ?`, [TableName.Certificate, sanitizedValue]);
            }
          });
        });
      }
      {
        const sanitizedValue = `%"${String(value)}"%`;
        return query.whereRaw(`??."altNames"::text ILIKE ?`, [TableName.Certificate, sanitizedValue]);
      }

    case PkiFilterOperator.CONTAINS:
      return applySanFilter(query, { ...filter, operator: PkiFilterOperator.MATCHES });

    case PkiFilterOperator.STARTS_WITH: {
      const startsWithValue = `%"${String(value)}%`;
      return query.whereRaw(`??."altNames"::text ILIKE ?`, [TableName.Certificate, startsWithValue]);
    }

    case PkiFilterOperator.ENDS_WITH: {
      const endsWithValue = `%${String(value)}"%`;
      return query.whereRaw(`??."altNames"::text ILIKE ?`, [TableName.Certificate, endsWithValue]);
    }

    default:
      logger.warn(`Unsupported operator for SAN: ${String(filter.operator)}`);
      return query;
  }
};

export const shouldIncludeCAs = (filters: TPkiFilterRule[]): boolean => {
  return filters.some((filter) => filter.field === PkiFilterField.INCLUDE_CAS && filter.value === true);
};

const applyCaCommonNameFilter = (query: Knex.QueryBuilder, filter: TPkiFilterRule): Knex.QueryBuilder => {
  const { value } = filter;
  const columnName = "ica.commonName";

  switch (filter.operator) {
    case PkiFilterOperator.EQUALS:
      return query.where(columnName, value as string);

    case PkiFilterOperator.MATCHES:
      if (Array.isArray(value)) {
        return query.whereIn(columnName, value);
      }
      return query.whereILike(columnName, `%${sanitizeLikeInput(String(value))}%`);

    case PkiFilterOperator.CONTAINS:
      if (Array.isArray(value)) {
        return query.where((builder) => {
          value.forEach((v, index) => {
            if (index === 0) {
              void builder.whereILike(columnName, `%${sanitizeLikeInput(String(v))}%`);
            } else {
              void builder.orWhereILike(columnName, `%${sanitizeLikeInput(String(v))}%`);
            }
          });
        });
      }
      return query.whereILike(columnName, `%${sanitizeLikeInput(String(value))}%`);

    case PkiFilterOperator.STARTS_WITH:
      return query.whereILike(columnName, `${sanitizeLikeInput(String(value))}%`);

    case PkiFilterOperator.ENDS_WITH:
      return query.whereILike(columnName, `%${sanitizeLikeInput(String(value))}`);

    default:
      logger.warn(`Unsupported operator for CA common_name: ${String(filter.operator)}`);
      return query;
  }
};

export const applyCaFilters = (
  query: Knex.QueryBuilder,
  filters: TPkiFilterRule[],
  projectId: string
): Knex.QueryBuilder => {
  let filteredQuery = query.where(`${TableName.CertificateAuthority}.projectId`, projectId).whereNotNull("ica.caId"); // Only include CAs that have internal CA data

  filters.forEach((filter) => {
    switch (filter.field) {
      case PkiFilterField.COMMON_NAME:
        filteredQuery = applyCaCommonNameFilter(filteredQuery, filter);
        break;

      default:
        break;
    }
  });

  return filteredQuery;
};

export const validateFilterRules = (filters: TPkiFilterRule[]): void => {
  for (const filter of filters) {
    if (!Object.values(PkiFilterField).includes(filter.field)) {
      throw new Error(`Invalid filter field: ${filter.field}`);
    }

    if (!Object.values(PkiFilterOperator).includes(filter.operator)) {
      throw new Error(`Invalid filter operator: ${filter.operator}`);
    }

    switch (filter.field) {
      case PkiFilterField.INCLUDE_CAS:
        if (typeof filter.value !== "boolean") {
          throw new Error("include_cas filter value must be boolean");
        }
        break;

      case PkiFilterField.PROFILE_NAME:
      case PkiFilterField.COMMON_NAME:
      case PkiFilterField.SAN:
        if (filter.operator === PkiFilterOperator.CONTAINS || filter.operator === PkiFilterOperator.MATCHES) {
          if (!Array.isArray(filter.value) && typeof filter.value !== "string") {
            throw new Error(
              `${filter.field} filter value must be string or array of strings for ${filter.operator} operator`
            );
          }
        } else if (typeof filter.value !== "string") {
          throw new Error(`${filter.field} filter value must be string for ${filter.operator} operator`);
        }
        break;

      default:
        break;
    }
  }
};

export const requiresProfileJoin = (filters: TPkiFilterRule[]): boolean => {
  return filters.some((filter) => filter.field === PkiFilterField.PROFILE_NAME);
};

export const applyCertificateFilters = (
  query: Knex.QueryBuilder,
  filters: TPkiFilterRule[],
  projectId: string
): Knex.QueryBuilder => {
  let filteredQuery = query.where(`${TableName.Certificate}.projectId`, projectId);

  const needsProfileJoin = requiresProfileJoin(filters);
  if (needsProfileJoin) {
    filteredQuery = filteredQuery.leftJoin(
      `${TableName.PkiCertificateProfile} as profile`,
      `${TableName.Certificate}.profileId`,
      "profile.id"
    );
  }

  filters.forEach((filter) => {
    switch (filter.field) {
      case PkiFilterField.PROFILE_NAME:
        filteredQuery = applyProfileNameFilter(filteredQuery, filter);
        break;

      case PkiFilterField.COMMON_NAME:
        filteredQuery = applyCommonNameFilter(filteredQuery, filter);
        break;

      case PkiFilterField.SAN:
        filteredQuery = applySanFilter(filteredQuery, filter);
        break;

      case PkiFilterField.INCLUDE_CAS:
        break;

      default:
        logger.warn(`Unknown filter field: ${String(filter.field)}`);
        break;
    }
  });

  return filteredQuery;
};
