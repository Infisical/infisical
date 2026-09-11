import picomatch from "picomatch";

export const doesFieldValueMatchJwtPolicy = (fieldValue: string | boolean | number, policyValue: string) => {
  if (typeof fieldValue === "boolean") {
    return fieldValue === (policyValue === "true");
  }

  if (typeof fieldValue === "number") {
    return fieldValue === parseInt(policyValue, 10);
  }

  return policyValue === fieldValue || picomatch.isMatch(fieldValue, policyValue, { bash: true });
};

export const doesAudValueMatchJwtPolicy = (fieldValue: string | string[], policyValue: string) => {
  if (Array.isArray(fieldValue)) {
    return fieldValue.some((entry) => entry === policyValue || picomatch.isMatch(entry, policyValue, { bash: true }));
  }

  return policyValue === fieldValue || picomatch.isMatch(fieldValue, policyValue, { bash: true });
};
