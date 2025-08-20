import { z } from "zod";

export const ApiShieldRuleFieldSchema = z.enum([
  // Request
  "requestMethod",
  "uriPath",
  "userAgent",
  "ip",
  "queryString",

  // Infisical
  "role"
]);

export const ApiShieldRuleOperatorSchema = z.enum([
  "eq",
  "ne",
  "contains",
  "not_contains",
  "starts_with",
  "not_starts_with",
  "ends_with",
  "not_ends_with",
  "wildcard",
  "in"
]);

export const ApiShieldRuleSchema = z.object({
  field: ApiShieldRuleFieldSchema,
  operator: ApiShieldRuleOperatorSchema,
  value: z.string()
});

export const ApiShieldRulesSchema = z.array(z.array(ApiShieldRuleSchema));
