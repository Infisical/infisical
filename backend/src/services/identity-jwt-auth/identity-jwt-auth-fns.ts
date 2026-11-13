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

export const doesAudValueMatchJwtPolicy = (fieldValue: unknown, policyValue: string) => {
  const audiences: unknown[] = Array.isArray(fieldValue) ? fieldValue : [fieldValue];

  if (!audiences.every((audience): audience is string => typeof audience === "string")) {
    return false;
  }

  return audiences.some((audience) => doesFieldValueMatchJwtPolicy(audience, policyValue));
};
