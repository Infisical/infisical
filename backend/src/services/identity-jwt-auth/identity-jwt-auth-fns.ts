import picomatch from "picomatch";

export const doesFieldValueMatchJwtPolicy = (fieldValue: string, policyValue: string) =>
  policyValue === fieldValue || picomatch.isMatch(fieldValue, policyValue);
