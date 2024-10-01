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

/**
 * Sorts an array of items into groups. The return value is a map where the keys are
 * the group ids the given getGroupId function produced and the value will be the last found one for the group key
 */
export const groupByUnique = <T, Key extends string | number | symbol>(
  array: readonly T[],
  getGroupId: (item: T) => Key
): Record<Key, T> =>
  array.reduce(
    (acc, item) => {
      const groupId = getGroupId(item);
      acc[groupId] = item;
      return acc;
    },
    {} as Record<Key, T>
  );

/**
 * Given a list of items returns a new list with only
 * unique items. Accepts an optional identity function
 * to convert each item in the list to a comparable identity
 * value
 */
export const unique = <T, K extends string | number | symbol>(array: readonly T[], toKey?: (item: T) => K): T[] => {
  const valueMap = array.reduce(
    (acc, item) => {
      const key = toKey ? toKey(item) : (item as unknown as string | number | symbol);
      if (acc[key]) return acc;
      acc[key] = item;
      return acc;
    },
    {} as Record<string | number | symbol, T>
  );
  return Object.values(valueMap);
};

/**
 * Convert an array to a dictionary by mapping each item
 * into a dictionary key & value
 */
export const objectify = <T, Key extends string | number | symbol, Value = T>(
  array: readonly T[],
  getKey: (item: T) => Key,
  getValue: (item: T) => Value = (item) => item as unknown as Value
): Record<Key, Value> => {
  return array.reduce(
    (acc, item) => {
      acc[getKey(item)] = getValue(item);
      return acc;
    },
    {} as Record<Key, Value>
  );
};
