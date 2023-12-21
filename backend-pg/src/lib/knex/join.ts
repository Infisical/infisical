export const mergeOneToManyRelation = <
  T extends Record<string, any>,
  Pk extends keyof T,
  P extends Record<string, any>,
  C extends Record<string, any>,
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
