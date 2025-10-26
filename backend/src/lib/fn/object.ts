/**
 * Pick a list of properties from an object
 * into a new object
 */
export const pick = <T extends object, TKeys extends keyof T>(obj: T, keys: TKeys[]): Pick<T, TKeys> => {
  if (!obj) return {} as Pick<T, TKeys>;
  return keys.reduce(
    (acc, key) => {
      if (Object.prototype.hasOwnProperty.call(obj, key)) acc[key] = obj[key];
      return acc;
    },
    {} as Pick<T, TKeys>
  );
};

/**
 * Removes (shakes out) undefined entries from an
 * object. Optional second argument shakes out values
 * by custom evaluation.
 */
export const shake = <RemovedKeys extends string, T = object>(
  obj: T,
  filter: (value: unknown) => boolean = (x) => x === undefined || x === null
): Omit<T, RemovedKeys> => {
  if (!obj) return {} as T;
  const keys = Object.keys(obj) as (keyof T)[];
  return keys.reduce((acc, key) => {
    if (filter(obj[key])) {
      return acc;
    }
    acc[key] = obj[key];
    return acc;
  }, {} as T);
};

export const titleCaseToCamelCase = (obj: unknown): unknown => {
  if (typeof obj !== "object" || obj === null) {
    return obj;
  }

  if (Array.isArray(obj)) {
    return obj.map((item: object) => titleCaseToCamelCase(item));
  }

  const result: Record<string, unknown> = {};

  for (const key in obj) {
    if (Object.prototype.hasOwnProperty.call(obj, key)) {
      const camelKey = key.charAt(0).toLowerCase() + key.slice(1);
      result[camelKey] = titleCaseToCamelCase((obj as Record<string, unknown>)[key]);
    }
  }

  return result;
};

export const deepEqual = (obj1: unknown, obj2: unknown): boolean => {
  if (obj1 === obj2) return true;

  if (obj1 === null || obj2 === null || obj1 === undefined || obj2 === undefined) {
    return obj1 === obj2;
  }

  if (typeof obj1 !== typeof obj2) return false;

  if (typeof obj1 !== "object") return obj1 === obj2;

  if (Array.isArray(obj1) !== Array.isArray(obj2)) return false;

  if (Array.isArray(obj1)) {
    const arr1 = obj1 as unknown[];
    const arr2 = obj2 as unknown[];
    if (arr1.length !== arr2.length) return false;
    return arr1.every((val, idx) => deepEqual(val, arr2[idx]));
  }

  const keys1 = Object.keys(obj1 as Record<string, unknown>).sort();
  const keys2 = Object.keys(obj2 as Record<string, unknown>).sort();

  if (keys1.length !== keys2.length) return false;
  if (keys1.some((key, idx) => key !== keys2[idx])) return false;

  return keys1.every((key) =>
    deepEqual((obj1 as Record<string, unknown>)[key], (obj2 as Record<string, unknown>)[key])
  );
};

export const deepEqualSkipFields = (obj1: unknown, obj2: unknown, skipFields: string[] = []): boolean => {
  if (skipFields.length === 0) {
    return deepEqual(obj1, obj2);
  }

  if (typeof obj1 !== "object" || typeof obj2 !== "object" || obj1 === null || obj2 === null) {
    return deepEqual(obj1, obj2);
  }

  const filtered1 = Object.fromEntries(
    Object.entries(obj1 as Record<string, unknown>).filter(([key]) => !skipFields.includes(key))
  );
  const filtered2 = Object.fromEntries(
    Object.entries(obj2 as Record<string, unknown>).filter(([key]) => !skipFields.includes(key))
  );

  return deepEqual(filtered1, filtered2);
};
