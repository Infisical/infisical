import { z } from "zod";

import { slugSchema } from "@app/server/lib/schemas";
import { HsmConnectorCredentialsSchema } from "@app/services/hsm-connector/hsm-connector-fns";

const HSM_CONNECTOR_NAME_MAX = 32;
const HSM_CONNECTOR_DESCRIPTION_MAX = 256;

const isProvided = (v: unknown) => v !== undefined && v !== null && v !== "";

export const GATEWAY_PICK_MESSAGE = "Exactly one of gatewayId or gatewayPoolId must be set";
export const gatewayPickRefiner = (data: { gatewayId?: string | null; gatewayPoolId?: string | null }) => {
  const hasGatewayId = isProvided(data.gatewayId);
  const hasPool = isProvided(data.gatewayPoolId);
  return hasGatewayId !== hasPool;
};

export const HsmConnectorSanitizedSchema = z.object({
  id: z.string().uuid(),
  name: z.string(),
  description: z.string().nullable(),
  projectId: z.string(),
  gatewayId: z.string().uuid().nullable(),
  gatewayPoolId: z.string().uuid().nullable(),
  slotLabel: z.string(),
  keyNamePrefix: z.string().nullable(),
  createdAt: z.date(),
  updatedAt: z.date()
});

export const HsmConnectorTestResultSchema = z.object({
  ok: z.boolean(),
  members: z
    .array(
      z.discriminatedUnion("ok", [
        z.object({
          gatewayId: z.string().uuid(),
          ok: z.literal(true),
          slotInfo: z.object({
            manufacturer: z.string(),
            model: z.string(),
            firmware: z.string()
          })
        }),
        z.object({
          gatewayId: z.string().uuid(),
          ok: z.literal(false),
          errorCode: z.string(),
          errorMessage: z.string()
        })
      ])
    )
    .min(1)
});

export const CreateBodySchema = z
  .object({
    name: slugSchema({ min: 1, max: HSM_CONNECTOR_NAME_MAX, field: "name" }),
    description: z.string().max(HSM_CONNECTOR_DESCRIPTION_MAX).optional(),
    gatewayId: z.string().uuid().optional(),
    gatewayPoolId: z.string().uuid().optional(),
    credentials: HsmConnectorCredentialsSchema
  })
  .refine(gatewayPickRefiner, { message: GATEWAY_PICK_MESSAGE, path: ["gatewayId"] });

export const UpdateBodySchema = z
  .object({
    name: slugSchema({ min: 1, max: HSM_CONNECTOR_NAME_MAX, field: "name" }).optional(),
    description: z.string().max(HSM_CONNECTOR_DESCRIPTION_MAX).optional(),
    gatewayId: z.string().uuid().nullable().optional(),
    gatewayPoolId: z.string().uuid().nullable().optional(),
    credentials: HsmConnectorCredentialsSchema.partial().optional()
  })
  .refine(
    (data) => {
      if (data.gatewayId === undefined && data.gatewayPoolId === undefined) return true;
      return gatewayPickRefiner({
        gatewayId: data.gatewayId ?? null,
        gatewayPoolId: data.gatewayPoolId ?? null
      });
    },
    { message: GATEWAY_PICK_MESSAGE, path: ["gatewayId"] }
  );

export const ConnectorIdParamSchema = z.object({
  connectorId: z.string().uuid()
});

export const LinkedCertificatesQuerySchema = z.object({
  offset: z.coerce.number().min(0).default(0),
  limit: z.coerce.number().min(1).max(100).default(20)
});

export const LinkedCertificatesResponseSchema = z.object({
  linkedCertificates: z.array(
    z.object({
      id: z.string().uuid(),
      commonName: z.string(),
      status: z.string(),
      notAfter: z.date(),
      hsmKeyLabel: z.string().nullable(),
      createdAt: z.date()
    })
  ),
  totalCount: z.number()
});
