import picomatch from "picomatch";

export const doesFieldValueMatchJwtPolicy = (fieldValue: string | boolean | number, policyValue: string) => {
  if (typeof fieldValue === "boolean") {
    return fieldValue === (policyValue === "true");
  }

  if (typeof fieldValue === "number") {
    return fieldValue === parseInt(policyValue, 10);
  }

  return policyValue === fieldValue || picomatch.isMatch(fieldValue, policyValue);
};
