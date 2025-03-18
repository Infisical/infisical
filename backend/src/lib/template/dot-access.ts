/**
 * Safely retrieves a value from a nested object using dot notation path
 */
export const getStringValueByDot = (
  obj: Record<string, unknown> | null | undefined,
  path: string,
  defaultValue?: string
): string | undefined => {
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

  if (typeof current !== "string") {
    return defaultValue;
  }

  return current;
};
