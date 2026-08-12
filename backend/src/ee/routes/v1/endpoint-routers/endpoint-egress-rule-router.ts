import { z } from "zod";

import {
  EndpointDestinationKind,
  EndpointEgressRuleAction,
  EndpointEgressRuleType
} from "@app/ee/services/endpoint/endpoint-enums";
import {
  assertDestinationMatchesKind,
  EndpointDestinationSchema,
  SanitizedEndpointEgressRuleSchema
} from "@app/ee/services/endpoint/endpoint-schemas";
import { ApiDocsTags } from "@app/lib/api-docs";
import { readLimit, writeLimit } from "@app/server/config/rateLimiter";
import { GenericResourceNameSchema } from "@app/server/lib/schemas";
import { verifyAuth } from "@app/server/plugins/auth/verify-auth";
import { AuthMode } from "@app/services/auth/auth-type";

// 1 TiB. High enough never to constrain a real policy, low enough that a typo cannot store a
// threshold no transfer could ever reach.
const MAX_THRESHOLD_BYTES = 1024 ** 4;

export const registerEndpointEgressRuleRouter = async (server: FastifyZodProvider) => {
  server.route({
    method: "GET",
    url: "/",
    config: { rateLimit: readLimit },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]),
    schema: {
      hide: false,
      tags: [ApiDocsTags.Endpoint],
      description: "List the egress rules every Infisical Endpoint device in this organization enforces",
      response: {
        200: z.object({ egressRules: SanitizedEndpointEgressRuleSchema.array() })
      }
    },
    handler: async (req) => {
      const egressRules = await server.services.endpoint.listEgressRules(req.permission);
      return { egressRules };
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
      description: "Create an egress rule",
      body: z
        .object({
          ruleType: z
            .nativeEnum(EndpointEgressRuleType)
            .describe(
              "'destination' blocks or allows traffic to a destination outright. 'volume' blocks it once a transfer threshold is crossed."
            ),
          name: GenericResourceNameSchema.describe("A name for the rule, shown in the console and on events."),
          kind: z.nativeEnum(EndpointDestinationKind).describe("How to interpret 'destination'."),
          destination: EndpointDestinationSchema.describe(
            "The destination to match, interpreted according to 'kind'. Domains are resolved on the device."
          ),
          action: z
            .nativeEnum(EndpointEgressRuleAction)
            .optional()
            .describe("Required for destination rules. Agents currently enforce 'deny' only."),
          thresholdBytes: z
            .number()
            .int()
            .positive()
            .max(MAX_THRESHOLD_BYTES)
            .optional()
            .describe("Required for volume rules. Bytes transferred to the destination before it is blocked."),
          isEnabled: z
            .boolean()
            .optional()
            .describe("Disabled rules stay in the console but are not sent to any device. Defaults to true.")
        })
        .superRefine(assertDestinationMatchesKind),
      response: {
        200: z.object({ egressRule: SanitizedEndpointEgressRuleSchema })
      }
    },
    handler: async (req) => {
      const egressRule = await server.services.endpoint.createEgressRule(req.body, req.permission);
      return { egressRule };
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
      description: "Update an egress rule",
      params: z.object({
        ruleId: z.string().uuid().describe("The ID of the rule to update.")
      }),
      body: z
        .object({
          name: GenericResourceNameSchema.optional().describe("A name for the rule."),
          kind: z.nativeEnum(EndpointDestinationKind).optional().describe("How to interpret 'destination'."),
          destination: EndpointDestinationSchema.optional().describe("The destination to match."),
          action: z.nativeEnum(EndpointEgressRuleAction).optional().describe("Destination rules only."),
          thresholdBytes: z
            .number()
            .int()
            .positive()
            .max(MAX_THRESHOLD_BYTES)
            .optional()
            .describe("Volume rules only."),
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
        200: z.object({ egressRule: SanitizedEndpointEgressRuleSchema })
      }
    },
    handler: async (req) => {
      const egressRule = await server.services.endpoint.updateEgressRule(
        { ruleId: req.params.ruleId, ...req.body },
        req.permission
      );
      return { egressRule };
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
      description: "Delete an egress rule",
      params: z.object({
        ruleId: z.string().uuid().describe("The ID of the rule to delete.")
      }),
      response: {
        200: z.object({ egressRule: SanitizedEndpointEgressRuleSchema })
      }
    },
    handler: async (req) => {
      const egressRule = await server.services.endpoint.deleteEgressRule(req.params, req.permission);
      return { egressRule };
    }
  });
};
