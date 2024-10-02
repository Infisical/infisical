import { AnyAbility, ExtractSubjectType } from "@casl/ability";
import { AbilityQuery, rulesToQuery } from "@casl/ability/extra";
import { Tables } from "knex/types/tables";

import { BadRequestError, UnauthorizedError } from "../errors";
import { TKnexDynamicOperator } from "../knex/dynamic";

type TBuildKnexQueryFromCaslDTO<K extends AnyAbility> = {
  ability: K;
  subject: ExtractSubjectType<Parameters<K["rulesFor"]>[1]>;
  action: Parameters<K["rulesFor"]>[0];
};

export const buildKnexQueryFromCaslOperators = <K extends AnyAbility>({
  ability,
  subject,
  action
}: TBuildKnexQueryFromCaslDTO<K>) => {
  const query = rulesToQuery(ability, action, subject, (rule) => {
    if (!rule.ast) throw new Error("Ast not defined");
    return rule.ast;
  });

  if (query === null) throw new UnauthorizedError({ message: `You don't have permission to do ${action} ${subject}` });
  return query;
};

type TFieldMapper<T extends keyof Tables> = {
  [K in T]: `${K}.${Exclude<keyof Tables[K]["base"], symbol>}`;
}[T];

type TFormatCaslFieldsWithTableNames<T extends keyof Tables> = {
  // handle if any missing operator else throw error let the app break because this is executing again the db
  missingOperatorCallback?: (operator: string) => void;
  fieldMapping: (arg: string) => TFieldMapper<T> | null;
  dynamicQuery: TKnexDynamicOperator;
};

export const formatCaslOperatorFieldsWithTableNames = <T extends keyof Tables>({
  missingOperatorCallback = (arg) => {
    throw new BadRequestError({ message: `Unknown permission operator: ${arg}` });
  },
  dynamicQuery: dynamicQueryAst,
  fieldMapping
}: TFormatCaslFieldsWithTableNames<T>) => {
  const stack: [TKnexDynamicOperator, TKnexDynamicOperator | null][] = [[dynamicQueryAst, null]];

  while (stack.length) {
    const [filterAst, parentAst] = stack.pop()!;

    if (filterAst.operator === "and" || filterAst.operator === "or" || filterAst.operator === "not") {
      filterAst.value.forEach((el) => {
        stack.push([el, filterAst]);
      });

      // eslint-disable-next-line no-continue
      continue;
    }

    if (
      filterAst.operator === "eq" ||
      filterAst.operator === "ne" ||
      filterAst.operator === "in" ||
      filterAst.operator === "endsWith" ||
      filterAst.operator === "startsWith"
    ) {
      const attrPath = fieldMapping(filterAst.field);
      if (attrPath) {
        filterAst.field = attrPath;
      } else if (parentAst && Array.isArray(parentAst.value)) {
        parentAst.value = parentAst.value.filter((childAst) => childAst !== filterAst) as string[];
      } else throw new Error("Unknown casl field");
      // eslint-disable-next-line no-continue
      continue;
    }

    if (parentAst && Array.isArray(parentAst.value)) {
      parentAst.value = parentAst.value.filter((childAst) => childAst !== filterAst) as string[];
    } else {
      missingOperatorCallback?.(filterAst.operator);
    }
  }
  return dynamicQueryAst;
};

export const convertCaslOperatorToKnexOperator = <T extends keyof Tables>(
  caslKnexOperators: AbilityQuery,
  fieldMapping: (arg: string) => TFieldMapper<T> | null
) => {
  const value = [];
  if (caslKnexOperators.$and) {
    value.push({
      operator: "not" as const,
      value: caslKnexOperators.$and as TKnexDynamicOperator[]
    });
  }
  if (caslKnexOperators.$or) {
    value.push({
      operator: "or" as const,
      value: caslKnexOperators.$or as TKnexDynamicOperator[]
    });
  }

  return formatCaslOperatorFieldsWithTableNames({
    dynamicQuery: {
      operator: "and",
      value
    },
    fieldMapping
  });
};
