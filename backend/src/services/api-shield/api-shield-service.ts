import RE2 from "re2";

import { EventType, TAuditLogServiceFactory } from "@app/ee/services/audit-log/audit-log-types";
import { getConfig } from "@app/lib/config/env";
import { request } from "@app/lib/config/request";
import { InternalServerError } from "@app/lib/errors";
import { logger } from "@app/lib/logger";

import { ActorAuthMethod, ActorType } from "../auth/auth-type";
import { TBridgeDALFactory } from "../bridge/bridge-dal";
import { TBridgeServiceFactory } from "../bridge/bridge-service";
import { TProjectRoleDALFactory } from "../project-role/project-role-dal";
import { ApiShieldRuleFieldSchema, ApiShieldRuleOperatorSchema } from "./api-shield-schemas";
import { ApiShieldRequestLog, ApiShieldRules } from "./api-shield-types";

const DAILY_SHADOW_TRAINING_PERIOD = 5; // 5 seconds (for prod use ~7 days)
const GEMINI_MODEL = "gemini-2.5-flash";
const GEMINI_API_URL = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`;

type TApiShieldServiceFactoryDep = {
  auditLogService: Pick<TAuditLogServiceFactory, "listAuditLogs">;
  bridgeService: Pick<TBridgeServiceFactory, "getById">;
  projectRoleDAL: Pick<TProjectRoleDALFactory, "find">;
  bridgeDAL: Pick<TBridgeDALFactory, "updateById">;
};

export type TApiShieldServiceFactory = ReturnType<typeof apiShieldServiceFactory>;

export const apiShieldServiceFactory = ({
  auditLogService,
  bridgeService,
  projectRoleDAL,
  bridgeDAL
}: TApiShieldServiceFactoryDep) => {
  const getRequestLogs = async ({
    actor,
    actorId,
    actorOrgId,
    actorAuthMethod,
    projectId,
    limit = 50,
    bridgeId
  }: {
    actor: ActorType;
    actorId: string;
    actorOrgId: string;
    actorAuthMethod: ActorAuthMethod;
    projectId: string;
    limit: number;
    bridgeId: string;
  }) => {
    const logs = await auditLogService.listAuditLogs({
      actor,
      actorAuthMethod,
      actorId,
      actorOrgId,
      filter: {
        projectId,
        limit,
        endDate: new Date().toISOString(),
        startDate: new Date(new Date().setMonth(new Date().getMonth() - 1)).toISOString(),
        eventType: [EventType.API_SHIELD_REQUEST],
        eventMetadata: {
          bridgeId
        }
      }
    });

    const logsParsed = logs.map((v) => ({
      ...(v.event.metadata as ApiShieldRequestLog),
      createdAt: v.createdAt.toISOString()
    }));
    return logsParsed;
  };

  const getBridgeRequests = async ({
    actor,
    actorId,
    actorOrgId,
    actorAuthMethod,
    projectId,
    limit = 50,
    bridgeId
  }: {
    actor: ActorType;
    actorId: string;
    actorOrgId: string;
    actorAuthMethod: ActorAuthMethod;
    projectId: string;
    limit: number;
    bridgeId: string;
  }) => {
    const logs = await auditLogService.listAuditLogs({
      actor,
      actorAuthMethod,
      actorId,
      actorOrgId,
      filter: {
        projectId,
        limit,
        endDate: new Date().toISOString(),
        startDate: new Date(new Date().setMonth(new Date().getMonth() - 1)).toISOString(),
        eventType: [EventType.API_SHIELD_REQUEST],
        eventMetadata: {
          bridgeId
        }
      }
    });

    return logs;
  };

  const generateRules = async ({
    prompt,
    currentRules,
    logs,
    openApiUrl,
    projectId,
    describeRuleChanges = false
  }: {
    prompt: string;
    openApiUrl?: string;
    currentRules?: ApiShieldRules;
    logs?: (Omit<ApiShieldRequestLog, "bridgeId"> & { createdAt: string })[];
    projectId: string;
    describeRuleChanges?: boolean;
  }) => {
    const appCfg = getConfig();

    if (!appCfg.GEMINI_API_KEY) {
      throw new InternalServerError({ message: "GEMINI_API_KEY env variable not configured" });
    }

    const projectRoles = projectRoleDAL.find({
      projectId
    });

    const apiShieldRuleSchema = {
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
    };

    let finalResponseSchema: object = {
      type: "ARRAY",
      items: {
        type: "ARRAY",
        items: apiShieldRuleSchema
      }
    };

    const systemInstructionText = `You are an API security rule generator.${openApiUrl ? ` Fetch the OpenAPI Schema for context from here: ${openApiUrl}` : ""}
    ${currentRules ? `\nCURRENT RULES:\n${JSON.stringify(currentRules)}\n` : ""}
    ${logs ? `\nRECENT REQUEST LOGS:\n${JSON.stringify(logs)}\n` : ""}
    ROLES:
    ${JSON.stringify(projectRoles)}

    RULE GENERATION GUIDELINES:
    - Top-level array elements use OR logic (any rule group can match)
    - Within each rule group (inner array), conditions use AND logic (all must match)
    - Consider the API schema structure when creating URL patterns
    ${describeRuleChanges ? `- IMPORTANT: Since 'describeRuleChanges' is enabled, your JSON response MUST be an object with three properties: 'rules' (containing the generated API Shield Rules as an array of arrays), 'description' (a short and concise markdown text explaining the changes/additions made to the rules and their purpose spoken as if you suggest those changes), and 'insight' (a short and concise markdown text which notifies the user of notable patters from within the provided request logs such as consecutive blocked requests).` : ""}
    `;

    if (describeRuleChanges) {
      finalResponseSchema = {
        type: "OBJECT",
        properties: {
          rules: { ...finalResponseSchema },
          description: {
            type: "STRING"
          },
          insight: {
            type: "STRING"
          }
        },
        required: ["rules", "description", "insight"]
      };
    }

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
        responseSchema: finalResponseSchema
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
          const parsedResponse = JSON.parse(generatedText) as
            | ApiShieldRules
            | { rules: ApiShieldRules; description: string; insight: string };

          if (describeRuleChanges) {
            return parsedResponse as { rules: ApiShieldRules; description: string; insight: string };
          }

          return { rules: parsedResponse as ApiShieldRules };
        } catch (e) {
          logger.error(e, "Failed to parse generated JSON from Gemini response");
          return { rules: [] };
        }
      }
      return { rules: [] };
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

    let shadowRuleSet;
    let dailyInsightText;
    let dailySuggestionText;
    let dailySuggestionRuleSet;

    const logs = await getRequestLogs({
      actor,
      actorAuthMethod,
      actorId,
      actorOrgId,
      limit: 500,
      projectId: bridge.projectId,
      bridgeId: bridge.id
    });

    // Shadow Rule Generator
    if (new Date().getTime() > new Date(bridge.createdAt).getTime() + DAILY_SHADOW_TRAINING_PERIOD * 1000) {
      const res = await generateRules({
        prompt:
          "Adjust or expand the current rules to account for the provided logs in a way where any new requests that fall outside of the current rules or logs would not pass",
        currentRules: bridge.shadowRuleSet as ApiShieldRules | undefined,
        logs: logs.map((v) => ({
          ...v,
          suspicious: undefined,
          result: undefined
        })),
        projectId: bridge.projectId
      });

      shadowRuleSet = JSON.stringify(res.rules);
    }

    // Suggestion Generator
    if (bridge.dailySuggestionEnabled) {
      const suggestedRules = (await generateRules({
        prompt: "Create a rule change suggestion which aims to optimize for the most recent batch of request logs",
        currentRules: bridge.ruleSet as ApiShieldRules | undefined,
        logs,
        projectId: bridge.projectId,
        describeRuleChanges: true
      })) as { rules: ApiShieldRules; description: string; insight: string };
      dailyInsightText = suggestedRules.insight.trim();
      dailySuggestionText = suggestedRules.description.trim();
      dailySuggestionRuleSet = suggestedRules.rules;
    }

    await bridgeDAL.updateById(bridge.id, {
      shadowRuleSet,
      dailyInsightText,
      dailySuggestionText,
      dailySuggestionRuleSet: dailySuggestionRuleSet ? JSON.stringify(dailySuggestionRuleSet) : undefined
    });
  };

  const checkRequestPassesRules = ({
    requestMethod,
    uriPath,
    userAgent,
    ip,
    rules,
    roles,
    queryString
  }: {
    requestMethod: string;
    uriPath: string;
    userAgent: string;
    ip: string;
    rules: ApiShieldRules;
    roles: string[];
    queryString: string[]; // "key=value"[]
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

        // Map the rule field to the corresponding request input
        if (["requestMethod", "uriPath", "userAgent", "ip"].includes(field)) {
          let requestValue: string | undefined;
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
            default:
              logger.warn(`checkRequestPassesRules: Unknown scalar rule field encountered: ${field as string}`);
              break;
          }

          if (requestValue === undefined) {
            conditionMet = false;
          } else {
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
                conditionMet = value
                  .split(",")
                  .map((el) => el.trim())
                  .includes(requestValue);
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
          }
        } else if (["role", "queryString"].includes(field)) {
          const valuesToCheck = field === "role" ? roles : queryString;
          const finalValue = field === "role" ? value.toLowerCase() : value;

          if (valuesToCheck.length === 0) {
            conditionMet = false;
          } else {
            const checkItemCondition = (itemValue: string): boolean => {
              switch (operator) {
                case "eq":
                  return itemValue === finalValue;
                case "ne":
                  return itemValue !== finalValue;
                case "contains":
                  return itemValue.includes(finalValue);
                case "not_contains":
                  return !itemValue.includes(finalValue);
                case "in":
                  return finalValue
                    .split(",")
                    .map((el) => el.trim())
                    .includes(itemValue);
                case "starts_with":
                  return itemValue.startsWith(finalValue);
                case "not_starts_with":
                  return !itemValue.startsWith(finalValue);
                case "ends_with":
                  return itemValue.endsWith(finalValue);
                case "not_ends_with":
                  return !itemValue.endsWith(finalValue);
                case "wildcard": {
                  const regexPattern = finalValue.replace(/\*/g, ".*");
                  try {
                    return new RE2(regexPattern).test(itemValue);
                  } catch (e) {
                    logger.error(
                      e,
                      `checkRequestPassesRules: Invalid RE2 wildcard pattern for array field: ${regexPattern}`
                    );
                    return false;
                  }
                }
                default:
                  logger.warn(
                    `checkRequestPassesRules: Unknown rule operator encountered for array field: ${operator as string}`
                  );
                  return false;
              }
            };

            // Determine conditionMet based on operator type and array contents
            switch (operator) {
              case "eq":
              case "contains":
              case "starts_with":
              case "ends_with":
              case "wildcard":
              case "in":
                conditionMet = valuesToCheck.some(checkItemCondition);
                break;
              case "ne":
              case "not_contains":
              case "not_starts_with":
              case "not_ends_with":
                conditionMet = valuesToCheck.every(checkItemCondition);
                break;
              default:
                logger.warn(
                  `checkRequestPassesRules: Unknown rule operator for array field, final determination: ${operator as string}`
                );
                conditionMet = false;
                break;
            }
          }
        } else {
          logger.warn(`checkRequestPassesRules: Unknown rule field encountered: ${field as string}`);
          conditionMet = false;
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
    checkRequestPassesRules,
    getBridgeRequests
  };
};
