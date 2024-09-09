import picomatch from "picomatch";

export const doesFieldValueMatchOidcPolicy = (fieldValue: string, policyValue: string) =>
  policyValue === fieldValue || picomatch.isMatch(fieldValue, policyValue);
