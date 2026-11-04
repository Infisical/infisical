import picomatch from "picomatch";

export const doesFieldValueMatchJwtPolicy = (fieldValue: unknown, policyValue: string) => {
  const values: unknown[] = Array.isArray(fieldValue) ? fieldValue : [fieldValue];

  return values.some((value) => {
    if (typeof value === "boolean") {
      return value === (policyValue === "true");
    }

    if (typeof value === "number") {
      return value === parseInt(policyValue, 10);
    }

    return (
      typeof value === "string" && (policyValue === value || picomatch.isMatch(value, policyValue, { bash: true }))
    );
  });
};
