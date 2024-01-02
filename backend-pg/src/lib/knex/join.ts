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
};

type MappedRecord<T extends TChildMapper<any>> = {
  [K in T["label"]]: ReturnType<Extract<T, { label: K }>["mapper"]>[];
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
  const parentLookup = new Set<string>();
  const childLookUp = new Set<string>();
  const recordsOrder: string[] = [];

  type Cm = MappedRecord<(typeof childrenMapper)[number]>;

  const recordsGroupedByPk: Record<string, P & Cm> = {};
  data.forEach((el) => {
    const pk = el[key];
    if (!parentLookup.has(pk)) {
      recordsGroupedByPk[pk] = parentMapper(el) as P & Cm;
      recordsOrder.push(pk);
      parentLookup.add(pk);
    }
    childrenMapper.forEach(({ label, mapper, key: cKey }) => {
      const ck = `${pk}-${label}-${el[cKey]}`;
      if (!childLookUp.has(ck)) {
        if (!recordsGroupedByPk[pk][label]) recordsGroupedByPk[pk][label as keyof Cm] = [] as any;
        const val = mapper(el);
        if (typeof val !== "undefined") recordsGroupedByPk[pk][label].push(val);
        childLookUp.add(ck);
      }
    });
  });
  return recordsOrder.map((pkId) => recordsGroupedByPk[pkId]);
};
