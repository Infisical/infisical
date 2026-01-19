import RE2 from "re2";

export enum PiiEntityType {
  EMAIL = "EMAIL",
  PHONE = "PHONE",
  SSN = "SSN",
  CREDIT_CARD = "CREDIT_CARD",
  IP_ADDRESS = "IP_ADDRESS"
}

// Precompiled RE2 patterns for PII detection
const PII_PATTERNS: Record<PiiEntityType, RE2> = {
  [PiiEntityType.EMAIL]: new RE2("[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\\.[a-zA-Z]{2,}", "g"),
  [PiiEntityType.PHONE]: new RE2("\\b(?:\\+?1[-.]?)?\\(?[0-9]{3}\\)?[-.\\s]?[0-9]{3}[-.\\s]?[0-9]{4}\\b", "g"),
  [PiiEntityType.SSN]: new RE2("\\b[0-9]{3}[-\\s]?[0-9]{2}[-\\s]?[0-9]{4}\\b", "g"),
  [PiiEntityType.CREDIT_CARD]: new RE2(
    "\\b(?:4[0-9]{12}(?:[0-9]{3})?|5[1-5][0-9]{14}|3[47][0-9]{13}|6(?:011|5[0-9]{2})[0-9]{12})\\b",
    "g"
  ),
  [PiiEntityType.IP_ADDRESS]: new RE2(
    "\\b(?:(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\\.){3}(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\\b",
    "g"
  )
};

const REDACTION_PLACEHOLDERS: Record<PiiEntityType, string> = {
  [PiiEntityType.EMAIL]: "[REDACTED_EMAIL]",
  [PiiEntityType.PHONE]: "[REDACTED_PHONE]",
  [PiiEntityType.SSN]: "[REDACTED_SSN]",
  [PiiEntityType.CREDIT_CARD]: "[REDACTED_CREDIT_CARD]",
  [PiiEntityType.IP_ADDRESS]: "[REDACTED_IP]"
};

/**
 * Redacts PII from a string based on the specified entity types
 */
export function redactPii(text: string, entityTypes: PiiEntityType[]): string {
  if (!text || entityTypes.length === 0) {
    return text;
  }

  let result = text;
  for (const entityType of entityTypes) {
    const pattern = PII_PATTERNS[entityType];
    const placeholder = REDACTION_PLACEHOLDERS[entityType];
    if (pattern && placeholder) {
      result = result.replace(pattern, placeholder);
    }
  }

  return result;
}

/**
 * Recursively redacts PII from an object, including nested objects and arrays
 */
export function redactPiiFromObject<T>(obj: T, entityTypes: PiiEntityType[]): T {
  if (!obj || entityTypes.length === 0) {
    return obj;
  }

  if (typeof obj === "string") {
    return redactPii(obj, entityTypes) as T;
  }

  if (Array.isArray(obj)) {
    const redactedArray = obj.map((item: unknown) => redactPiiFromObject(item, entityTypes));
    return redactedArray as T;
  }

  if (typeof obj === "object") {
    const result: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(obj)) {
      result[key] = redactPiiFromObject(value, entityTypes);
    }
    return result as T;
  }

  return obj;
}
