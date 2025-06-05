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
