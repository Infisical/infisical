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

export const deterministicStringify = (value: unknown): string => {
  if (value === null || value === undefined) {
    return JSON.stringify(value);
  }

  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
    return JSON.stringify(value);
  }

  if (Array.isArray(value)) {
    const items = value.map((item) => deterministicStringify(item));
    return `[${items.join(",")}]`;
  }

  if (typeof value === "object") {
    const sortedKeys = Object.keys(value).sort();
    const sortedObj: Record<string, unknown> = {};
    for (const key of sortedKeys) {
      const val = (value as Record<string, unknown>)[key];
      if (typeof val === "object" && val !== null) {
        sortedObj[key] = JSON.parse(deterministicStringify(val));
      } else {
        sortedObj[key] = val;
      }
    }
    return JSON.stringify(sortedObj);
  }

  return JSON.stringify(value);
};

/**
 * Recursively extracts all field paths from a nested object structure.
 * Returns an array of dot-notation paths (e.g., ["password", "username", "field.nestedField"])
 */
export const extractObjectFieldPaths = (obj: unknown, prefix = ""): string[] => {
  const paths: string[] = [];

  if (obj === null || obj === undefined) {
    return paths;
  }

  if (typeof obj !== "object") {
    // return the path if it exists
    if (prefix) {
      paths.push(prefix);
    }
    return paths;
  }

  if (Array.isArray(obj)) {
    // for arrays, we log the array itself and optionally nested paths
    if (prefix) {
      paths.push(prefix);
    }
    // we just want to know the array field changed
    obj.forEach((item, index) => {
      if (typeof item === "object" && item !== null) {
        const nestedPaths = extractObjectFieldPaths(item, `${prefix}[${index}]`);
        paths.push(...nestedPaths);
      }
    });
    return paths;
  }

  // for objects, extract all keys and recurse
  const keys = Object.keys(obj);
  if (keys.length === 0 && prefix) {
    // empty object with prefix
    paths.push(prefix);
  }

  keys.forEach((key) => {
    const currentPath = prefix ? `${prefix}.${key}` : key;
    const value = (obj as Record<string, unknown>)[key];

    if (value === null || value === undefined) {
      paths.push(currentPath);
    } else if (typeof value === "object") {
      // recurse into nested objects/arrays
      const nestedPaths = extractObjectFieldPaths(value, currentPath);
      if (nestedPaths.length === 0) {
        // if nested object is empty, add the path itself
        paths.push(currentPath);
      } else {
        paths.push(...nestedPaths);
      }
    } else {
      paths.push(currentPath);
    }
  });

  return paths;
};
