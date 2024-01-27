export const mergeOneToManyRelation = <
  T extends Record<string, any>,
  Pk extends keyof T,
  P extends Record<string, any>,
  C extends any,
  Ck extends string = "child"
>(
  data: T[],
  key: Pk,
  parentMapper: (arg: T) => P,
  childMapper: (arg: T) => C,
  childKey: Ck
) => {
  let prevPkIndex = -1;
  let prevPkId: null | string = null;

  const groupedRecord: (P & Record<Ck, C[]>)[] = [];
  for (let i = 0; i < data.length; i += 1) {
    const pk = data[i][key];
    const row = data[i];
    if (pk !== prevPkId) {
      const parent = parentMapper(row) as any;
      parent[childKey] = [];
      groupedRecord.push(parent);
      prevPkId = pk;
      prevPkIndex += 1;
    }
    groupedRecord[prevPkIndex][childKey].push(childMapper(row));
  }
  return groupedRecord;
};

export type TSqlPackRelationships<
  T extends Record<string, any>,
  P extends Record<string, any>,
  C extends TChildMapper<T>[]
> = {
  data: T[];
  key: keyof T;
  parentMapper: (arg: T) => P;
  childrenMapper: C;
};

export type TChildMapper<T extends {}, U extends string = string, R extends unknown = unknown> = {
  key: keyof T;
  label: U;
  mapper: (arg: T) => R;
  childrenMapper?: TChildMapper<T, U, R>[];
};

type MappedRecord<T extends TChildMapper<any>> = {
  [K in T["label"]]: Array<
    Exclude<ReturnType<Extract<T, { label: K }>["mapper"]>, null | undefined> &
      (Extract<T, { label: K }>["childrenMapper"] extends Array<infer TChild>
        ? TChild extends TChildMapper<any>
          ? MappedRecord<TChild>
          : {}
        : {})
  >;
};

const sqlChildMapper = <
  T extends Record<string, any> = {},
  P extends Record<string, any> = {},
  C extends TChildMapper<T>[] = TChildMapper<T>[]
>(
  doc: T,
  docsByPk: P,
  lookupTable: Set<string>,
  pk: keyof P,
  prefix: string,
  childrenMapper: C
) => {
  if (!docsByPk) return;

  type Cm = MappedRecord<(typeof childrenMapper)[number]>;
  childrenMapper.forEach(({ label, mapper, key: childPk, childrenMapper: nestedMappers }) => {
    // eslint-disable-next-line
    if (!docsByPk?.[pk as keyof P]?.[label]) docsByPk[pk as keyof P][label as keyof Cm] = [] as any;

    if (doc?.[childPk] !== null && typeof doc?.[childPk] !== "undefined") {
      const ck = `${prefix}-${label}-${doc[childPk]}`;
      const val = mapper(doc);
      if (!lookupTable.has(ck)) {
        if (typeof val !== "undefined" && val !== null) docsByPk[pk as keyof P][label].push(val);
        lookupTable.add(ck);
      }
      if (nestedMappers && val) {
        sqlChildMapper(
          doc,
          docsByPk[pk][label as keyof P],
          lookupTable,
          docsByPk[pk][label as keyof P].length - 1,
          ck,
          nestedMappers
        );
      }
    }
  });
};

export const sqlNestRelationships = <
  T extends Record<string, any> = {},
  P extends Record<string, any> = {},
  C extends TChildMapper<T>[] = TChildMapper<T>[]
>({
  data,
  key,
  parentMapper,
  childrenMapper
}: TSqlPackRelationships<T, P, C>) => {
  const lookupTable = new Set<string>();
  const recordsOrder: string[] = [];

  type Cm = MappedRecord<(typeof childrenMapper)[number]>;

  const recordsGroupedByPk: Record<string, P & Cm> = {};
  data.forEach((doc) => {
    const pk = doc[key];
    if (!lookupTable.has(pk)) {
      recordsGroupedByPk[pk] = parentMapper(doc) as P & Cm;
      recordsOrder.push(pk);
      lookupTable.add(pk);
    }

    sqlChildMapper(doc, recordsGroupedByPk, lookupTable, pk, pk, childrenMapper);
  });
  return recordsOrder.map((pkId) => recordsGroupedByPk[pkId]);
};
