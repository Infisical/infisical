import picomatch from "picomatch";

export const doesFieldValueMatchOidcPolicy = (fieldValue: string, policyValue: string) =>
  policyValue === fieldValue || picomatch.isMatch(fieldValue, policyValue);

export const doesAudValueMatchOidcPolicy = (fieldValue: string | string[], policyValue: string) => {
  if (Array.isArray(fieldValue)) {
    return fieldValue.some((entry) => entry === policyValue || picomatch.isMatch(entry, policyValue));
  }

  return policyValue === fieldValue || picomatch.isMatch(fieldValue, policyValue);
};
