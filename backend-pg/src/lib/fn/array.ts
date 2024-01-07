/**
 * Sorts an array of items into groups. The return value is a map where the keys are
 * the group ids the given getGroupId function produced and the value is an array of
 * each item in that group.
 */
export const groupBy = <T, Key extends string | number | symbol>(
  array: readonly T[],
  getGroupId: (item: T) => Key
): Record<Key, T[]> =>
  array.reduce(
    (acc, item) => {
      const groupId = getGroupId(item);
      if (!acc[groupId]) acc[groupId] = [];
      acc[groupId].push(item);
      return acc;
    },
    {} as Record<Key, T[]>
  );
