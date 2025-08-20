import RE2 from "re2";

import { TAuditLogServiceFactory } from "@app/ee/services/audit-log/audit-log-types";
import { getConfig } from "@app/lib/config/env";
import { request } from "@app/lib/config/request";
import { InternalServerError } from "@app/lib/errors";
import { logger } from "@app/lib/logger";

import { ActorAuthMethod, ActorType } from "../auth/auth-type";
import { TBridgeServiceFactory } from "../bridge/bridge-service";
import { TProjectRoleDALFactory } from "../project-role/project-role-dal";
import { ApiShieldRuleFieldSchema, ApiShieldRuleOperatorSchema } from "./api-shield-schemas";
import { ApiShieldRules } from "./api-shield-types";

const GEMINI_MODEL = "gemini-2.5-flash";
const GEMINI_API_URL = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`;

type TApiShieldServiceFactoryDep = {
  auditLogService: Pick<TAuditLogServiceFactory, "listAuditLogs">;
  bridgeService: Pick<TBridgeServiceFactory, "getById">;
  projectRoleDAL: Pick<TProjectRoleDALFactory, "find">;
};

export type TApiShieldServiceFactory = ReturnType<typeof apiShieldServiceFactory>;

export const apiShieldServiceFactory = ({
  auditLogService,
  bridgeService,
  projectRoleDAL
}: TApiShieldServiceFactoryDep) => {
  const getCurrentRules = (): ApiShieldRules => {
    return [
      [
        {
          field: "requestMethod",
          operator: "eq",
          value: "GET"
        },
        {
          field: "role",
          operator: "eq",
          value: "Admin"
        }
      ]
    ];
  };

  const getRequestLogs = () => {
    return [
      {
        method: "GET",
        url: "/api/users",
        headers: { Authorization: "Bearer token123" },
        result: "PASSED"
      },
      {
        method: "POST",
        url: "/api/users",
        headers: { "Content-Type": "application/json" },
        body: { name: "John" },
        result: "BLOCKED"
      },
      {
        method: "GET",
        url: "/api/users/123",
        headers: { Authorization: "Bearer token456" },
        result: "PASSED"
      },
      {
        method: "PUT",
        url: "/api/users/123",
        headers: { "Content-Type": "application/json" },
        body: { name: "Jane" },
        result: "BLOCKED"
      },
      {
        method: "DELETE",
        url: "/api/posts/456",
        headers: { Authorization: "Bearer token789" },
        result: "BLOCKED"
      },
      {
        method: "GET",
        url: "/api/posts?limit=10&offset=0",
        headers: { Authorization: "Bearer token101" },
        result: "PASSED"
      },
      {
        method: "GET",
        url: "/api/admin/stats",
        headers: { Authorization: "Bearer admin_token" },
        result: "BLOCKED"
      },
      {
        method: "POST",
        url: "/api/posts",
        headers: { "Content-Type": "application/json" },
        body: { title: "New Post" },
        result: "BLOCKED"
      }
    ];
  };

  const generateRules = async ({
    prompt,
    currentRules,
    logs,
    swaggerJson,
    projectId
  }: {
    prompt: string;
    swaggerJson?: object;
    currentRules?: ApiShieldRules;
    logs?: {
      method: string;
      url: string;
      headers: Record<string, string | undefined>;
      result?: string;
      body?: Record<string, string | undefined>;
    }[];
    projectId: string;
  }) => {
    const appCfg = getConfig();

    if (!appCfg.GEMINI_API_KEY) {
      throw new InternalServerError({ message: "GEMINI_API_KEY env variable not configured" });
    }

    const projectRoles = projectRoleDAL.find({
      projectId
    });

    const systemInstructionText = `You are an API security rule generator.
${currentRules ? `\nCURRENT RULES:\n${JSON.stringify(currentRules)}\n` : ""}
${swaggerJson ? `\nAPI SCHEMA CONTEXT:\n${JSON.stringify(swaggerJson)}\n` : ""}
${logs ? `\nRECENT REQUEST LOGS:\n${JSON.stringify(logs)}\n` : ""}
ROLES:
${JSON.stringify(projectRoles)}

RULE GENERATION GUIDELINES:
- Top-level array elements use OR logic (any rule group can match)
- Within each rule group (inner array), conditions use AND logic (all must match)
- Consider the API schema structure when creating URL patterns`;

    const requestBody = {
      contents: [
        {
          parts: [
            {
              text: prompt
            }
          ]
        }
      ],
      systemInstruction: {
        parts: [
          {
            text: systemInstructionText
          }
        ]
      },
      generationConfig: {
        responseMimeType: "application/json",
        responseSchema: {
          type: "ARRAY",
          items: {
            type: "ARRAY",
            items: {
              type: "OBJECT",
              properties: {
                field: {
                  type: "STRING",
                  enum: ApiShieldRuleFieldSchema.options
                },
                operator: {
                  type: "STRING",
                  enum: ApiShieldRuleOperatorSchema.options
                },
                value: {
                  type: "STRING"
                }
              },
              required: ["field", "operator", "value"]
            }
          }
        }
      }
    };

    try {
      const { data } = await request.post<{ candidates: { content: { parts: { text: string }[] } }[] }>(
        GEMINI_API_URL,
        JSON.stringify(requestBody),
        {
          headers: {
            "Content-Type": "application/json",
            "x-goog-api-key": appCfg.GEMINI_API_KEY
          }
        }
      );

      const generatedText = data.candidates[0].content.parts[0].text;
      if (generatedText) {
        try {
          return JSON.parse(generatedText) as ApiShieldRules;
        } catch (e) {
          logger.error(e, "Failed to parse generated JSON from Gemini response");
        }
      }
      return [];
    } catch (err) {
      logger.error(err, "Failed to send request to Gemini API");
      throw err;
    }
  };

  const runDailyCron = async ({
    actor,
    actorAuthMethod,
    actorId,
    actorOrgId,
    bridgeId
  }: {
    actor: ActorType;
    actorId: string;
    actorOrgId: string;
    actorAuthMethod: ActorAuthMethod;
    bridgeId: string;
  }) => {
    const bridge = await bridgeService.getById({ id: bridgeId });

    const logs = await auditLogService.listAuditLogs({
      actor,
      actorAuthMethod,
      actorId,
      actorOrgId,
      filter: {
        projectId: bridge.projectId,
        limit: 500,
        endDate: new Date().toISOString(),
        startDate: new Date(new Date().setMonth(new Date().getMonth() - 1)).toISOString()
      }
    });

    // TODO(andrey): Filter logs and strip them down to essentials

    const currentRules = getCurrentRules(); // TODO(andrey): Get most recent shadow rules

    const rules = await generateRules({
      prompt:
        "Adjust or expand the current rules to account for the provided logs in a way where any new requests that fall outside of the current rules or logs would not pass",
      currentRules,
      logs
    });

    // TODO(andrey): Update bridge shadow rules in DB

    return rules;
  };

  const checkRequestPassesRules = ({
    requestMethod,
    uriPath,
    userAgent,
    ip,
    rules,
    roles
  }: {
    requestMethod: string;
    uriPath: string;
    userAgent: string;
    ip: string;
    rules: ApiShieldRules;
    roles: string[];
  }): boolean => {
    // If no rules are defined, the request does not pass
    if (rules.length === 0) return false;

    // Iterate through each rule group (OR logic: if any group matches, the request passes)
    for (const ruleGroup of rules) {
      let groupMatches = true;

      // Iterate through each condition within the rule group
      for (const rule of ruleGroup) {
        const { field, operator, value } = rule;
        let conditionMet = false;
        let requestValue: string | undefined;

        // Map the rule field to the corresponding request input
        switch (field) {
          case "requestMethod":
            requestValue = requestMethod;
            break;
          case "uriPath":
            requestValue = uriPath;
            break;
          case "userAgent":
            requestValue = userAgent;
            break;
          case "ip":
            requestValue = ip;
            break;
          case "role":
            requestValue = roles.find((v) => v === value);
            break;
          default:
            logger.warn(`checkRequestPassesRules: Unknown rule field encountered: ${field}`);
            requestValue = undefined;
            break;
        }

        if (requestValue === undefined) {
          groupMatches = false;
          break;
        }

        switch (operator) {
          case "eq":
            conditionMet = requestValue === value;
            break;
          case "ne":
            conditionMet = requestValue !== value;
            break;
          case "contains":
            conditionMet = requestValue.includes(value);
            break;
          case "not_contains":
            conditionMet = !requestValue.includes(value);
            break;
          case "in":
            conditionMet = !requestValue
              .split(",")
              .map((el) => el.trim())
              .some((el) => el === value);
            break;
          case "starts_with":
            conditionMet = requestValue.startsWith(value);
            break;
          case "not_starts_with":
            conditionMet = !requestValue.startsWith(value);
            break;
          case "ends_with":
            conditionMet = requestValue.endsWith(value);
            break;
          case "not_ends_with":
            conditionMet = !requestValue.endsWith(value);
            break;
          case "wildcard": {
            const regexPattern = value.replace(/\*/g, ".*");
            try {
              conditionMet = new RE2(regexPattern).test(requestValue);
            } catch (e) {
              logger.error(e, `checkRequestPassesRules: Invalid RE2 wildcard pattern: ${regexPattern}`);
              conditionMet = false;
            }
            break;
          }
          default:
            logger.warn(`checkRequestPassesRules: Unknown rule operator encountered: ${operator as string}`);
            conditionMet = false;
            break;
        }

        if (!conditionMet) {
          groupMatches = false;
          break;
        }
      }

      if (groupMatches) {
        return true;
      }
    }

    // If no rule group explicitly matched after checking all of them, the request does not pass.
    return false;
  };

  return {
    getRequestLogs,
    generateRules,
    runDailyCron,
    checkRequestPassesRules
  };
};
