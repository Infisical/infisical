import picomatch from "picomatch";

export const doesFieldValueMatchJwtPolicy = (fieldValue: string | boolean, policyValue: string) => {
  if (typeof fieldValue === "boolean") {
    return fieldValue === (policyValue === "true");
  }

  return policyValue === fieldValue || picomatch.isMatch(fieldValue, policyValue);
};
