import { z } from "zod";

import {
  ApiShieldRuleFieldSchema,
  ApiShieldRuleOperatorSchema,
  ApiShieldRuleSchema,
  ApiShieldRulesSchema
} from "./api-shield-schemas";

export type ApiShieldRuleField = z.infer<typeof ApiShieldRuleFieldSchema>;

export type ApiShieldRuleOperator = z.infer<typeof ApiShieldRuleOperatorSchema>;

export type ApiShieldRule = z.infer<typeof ApiShieldRuleSchema>;

export type ApiShieldRules = z.infer<typeof ApiShieldRulesSchema>;

export type ApiShieldRequestLog = {
  requestMethod: string;
  ip: string;
  uriPath: string;
  userAgent: string;
  queryString?: string[];
  headers: Record<string, string>;
  body?: unknown;
  result?: string;
  suspicious?: boolean;
  bridgeId: string;
  suspicious?: boolean;
};
