import { z } from "zod";

import {
  EndpointDestinationKind,
  EndpointNetworkRuleAction,
  EndpointNetworkRuleType
} from "@app/ee/services/endpoint/endpoint-enums";
import {
  assertDestinationMatchesKind,
  assertNetworkRuleShape,
  EndpointDestinationSchema,
  SanitizedEndpointNetworkRuleSchema
} from "@app/ee/services/endpoint/endpoint-schemas";
import { ENDPOINT_MAX_TRANSFER_WINDOW_SECONDS } from "@app/ee/services/endpoint/endpoint-constants";
import { ApiDocsTags } from "@app/lib/api-docs";
import { readLimit, writeLimit } from "@app/server/config/rateLimiter";
import { GenericResourceNameSchema } from "@app/server/lib/schemas";
import { verifyAuth } from "@app/server/plugins/auth/verify-auth";
import { AuthMode } from "@app/services/auth/auth-type";

// 1 TiB. High enough never to constrain a real policy, low enough that a typo cannot store a
// threshold no transfer could ever reach.
const MAX_THRESHOLD_BYTES = 1024 ** 4;

export const registerEndpointNetworkRuleRouter = async (server: FastifyZodProvider) => {
  server.route({
    method: "GET",
    url: "/",
    config: { rateLimit: readLimit },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]),
    schema: {
      hide: false,
      tags: [ApiDocsTags.Endpoint],
      description: "List the network rules every Infisical Endpoint device in this organization enforces",
      response: {
        200: z.object({ networkRules: SanitizedEndpointNetworkRuleSchema.array() })
      }
    },
    handler: async (req) => {
      const networkRules = await server.services.endpoint.listNetworkRules(req.permission);
      return { networkRules };
    }
  });

  server.route({
    method: "POST",
    url: "/",
    config: { rateLimit: writeLimit },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]),
    schema: {
      hide: false,
      tags: [ApiDocsTags.Endpoint],
      description: "Create an network rule",
      body: z
        .object({
          ruleType: z
            .nativeEnum(EndpointNetworkRuleType)
            .describe(
              "'destination' blocks or allows traffic to a destination outright. 'volume' blocks it once a transfer threshold is crossed."
            ),
          name: GenericResourceNameSchema.describe("A name for the rule, shown in the console and on events."),
          kind: z
            .nativeEnum(EndpointDestinationKind)
            .optional()
            .describe("Destination rules only. How to interpret 'destination'."),
          destination: EndpointDestinationSchema.optional().describe(
            "Destination rules only. The destination to match, interpreted according to 'kind'. Domains are resolved on the device."
          ),
          action: z
            .nativeEnum(EndpointNetworkRuleAction)
            .optional()
            .describe("Required for destination rules. Agents currently enforce 'deny' only."),
          thresholdBytes: z
            .number()
            .int()
            .positive()
            .max(MAX_THRESHOLD_BYTES)
            .optional()
            .describe(
              "Required for volume rules. Bytes a device may send to any one destination within 'windowSeconds' before that destination is blocked."
            ),
          windowSeconds: z
            .number()
            .int()
            .min(1)
            .max(ENDPOINT_MAX_TRANSFER_WINDOW_SECONDS)
            .optional()
            .describe(
              "Required for volume rules. The trailing window the threshold is measured over, so the limit is a rate rather than a lifetime total. Defaults to 60 in the console."
            ),
          isEnabled: z
            .boolean()
            .optional()
            .describe("Disabled rules stay in the console but are not sent to any device. Defaults to true.")
        })
        .superRefine(assertNetworkRuleShape),
      response: {
        200: z.object({ networkRule: SanitizedEndpointNetworkRuleSchema })
      }
    },
    handler: async (req) => {
      const networkRule = await server.services.endpoint.createNetworkRule(req.body, req.permission);
      return { networkRule };
    }
  });

  server.route({
    method: "PATCH",
    url: "/:ruleId",
    config: { rateLimit: writeLimit },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]),
    schema: {
      hide: false,
      tags: [ApiDocsTags.Endpoint],
      description: "Update an network rule",
      params: z.object({
        ruleId: z.string().uuid().describe("The ID of the rule to update.")
      }),
      body: z
        .object({
          name: GenericResourceNameSchema.optional().describe("A name for the rule."),
          kind: z
            .nativeEnum(EndpointDestinationKind)
            .optional()
            .describe("Destination rules only. How to interpret 'destination'."),
          destination: EndpointDestinationSchema.optional().describe(
            "Destination rules only. The destination to match."
          ),
          action: z.nativeEnum(EndpointNetworkRuleAction).optional().describe("Destination rules only."),
          thresholdBytes: z
            .number()
            .int()
            .positive()
            .max(MAX_THRESHOLD_BYTES)
            .optional()
            .describe(
              "Volume rules only. Bytes a device may send to any one destination within 'windowSeconds' before it is blocked."
            ),
          windowSeconds: z
            .number()
            .int()
            .min(1)
            .max(ENDPOINT_MAX_TRANSFER_WINDOW_SECONDS)
            .optional()
            .describe("Volume rules only. The trailing window the threshold is measured over."),
          isEnabled: z.boolean().optional().describe("Whether devices should enforce this rule.")
        })
        .superRefine((body, ctx) => {
          // kind decides how destination is read, so one cannot be changed without the other.
          if ((body.kind === undefined) !== (body.destination === undefined)) {
            ctx.addIssue({
              code: z.ZodIssueCode.custom,
              path: ["destination"],
              message: "'kind' and 'destination' must be updated together, so the destination is validated correctly."
            });
            return;
          }
          if (body.kind && body.destination) {
            assertDestinationMatchesKind({ kind: body.kind, destination: body.destination }, ctx);
          }
        }),
      response: {
        200: z.object({ networkRule: SanitizedEndpointNetworkRuleSchema })
      }
    },
    handler: async (req) => {
      const networkRule = await server.services.endpoint.updateNetworkRule(
        { ruleId: req.params.ruleId, ...req.body },
        req.permission
      );
      return { networkRule };
    }
  });

  server.route({
    method: "DELETE",
    url: "/:ruleId",
    config: { rateLimit: writeLimit },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]),
    schema: {
      hide: false,
      tags: [ApiDocsTags.Endpoint],
      description: "Delete an network rule",
      params: z.object({
        ruleId: z.string().uuid().describe("The ID of the rule to delete.")
      }),
      response: {
        200: z.object({ networkRule: SanitizedEndpointNetworkRuleSchema })
      }
    },
    handler: async (req) => {
      const networkRule = await server.services.endpoint.deleteNetworkRule(req.params, req.permission);
      return { networkRule };
    }
  });
};
