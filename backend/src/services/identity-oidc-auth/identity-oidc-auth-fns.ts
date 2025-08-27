import picomatch from "picomatch";

export const doesFieldValueMatchOidcPolicy = (fieldValue: string | number | boolean, policyValue: string) => {
  if (typeof fieldValue === "boolean") {
    return fieldValue === (policyValue === "true");
  }

  if (typeof fieldValue === "number") {
    return fieldValue === parseInt(policyValue, 10);
  }

  return policyValue === fieldValue || picomatch.isMatch(fieldValue, policyValue);
};

export const doesAudValueMatchOidcPolicy = (fieldValue: string | string[], policyValue: string) => {
  if (Array.isArray(fieldValue)) {
    return fieldValue.some((entry) => entry === policyValue || picomatch.isMatch(entry, policyValue));
  }

  return policyValue === fieldValue || picomatch.isMatch(fieldValue, policyValue);
};
