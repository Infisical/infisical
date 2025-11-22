/**
 * Safely retrieves a value from a nested object using dot notation path
 */
export const getValueByDot = (
  obj: Record<string, unknown> | null | undefined,
  path: string,
  defaultValue?: string | number | boolean | string[]
): string | number | boolean | string[] | undefined => {
  // Handle null or undefined input
  if (!obj) {
    return defaultValue;
  }

  const parts = path.split(".");
  let current: unknown = obj;

  for (const part of parts) {
    const isObject = typeof current === "object" && !Array.isArray(current) && current !== null;
    if (!isObject) {
      return defaultValue;
    }
    if (!Object.hasOwn(current as object, part)) {
      // Check if the property exists as an own property
      return defaultValue;
    }
    current = (current as Record<string, unknown>)[part];
  }

  if (
    typeof current !== "string" &&
    typeof current !== "number" &&
    typeof current !== "boolean" &&
    !(Array.isArray(current) && current.every(item => typeof item === "string"))
  ) {
    return defaultValue;
  }

  return current;
};
