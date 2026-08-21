import picomatch from "picomatch";

const doesStringMatchJwtPolicy = (fieldValue: string, policyValue: string) =>
  policyValue === fieldValue || picomatch.isMatch(fieldValue, policyValue, { bash: true });

export const doesFieldValueMatchJwtPolicy = (fieldValue: string | boolean | number, policyValue: string) => {
  if (typeof fieldValue === "boolean") {
    return fieldValue === (policyValue === "true");
  }

  if (typeof fieldValue === "number") {
    return fieldValue === parseInt(policyValue, 10);
  }

  return doesStringMatchJwtPolicy(fieldValue, policyValue);
};

export const doesAudValueMatchJwtPolicy = (fieldValue: string | string[], policyValue: string) => {
  if (Array.isArray(fieldValue)) {
    return fieldValue.some((entry) => typeof entry === "string" && doesStringMatchJwtPolicy(entry, policyValue));
  }

  return doesStringMatchJwtPolicy(fieldValue, policyValue);
};

export const hasJwtAudienceClaim = (aud: unknown): aud is string | string[] => {
  if (typeof aud === "string") return aud.length > 0;
  return Array.isArray(aud) && aud.length > 0;
};
