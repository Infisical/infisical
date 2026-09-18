import { z } from "zod";

import { slugSchema } from "@app/server/lib/schemas";
import { CaStatus, InternalCaType } from "@app/services/certificate-authority/certificate-authority-enums";
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

export const CreateHsmConnectorBodySchema = z
  .object({
    name: slugSchema({ min: 1, max: HSM_CONNECTOR_NAME_MAX, field: "name" }),
    description: z.string().max(HSM_CONNECTOR_DESCRIPTION_MAX).optional(),
    gatewayId: z.string().uuid().optional(),
    gatewayPoolId: z.string().uuid().optional(),
    credentials: HsmConnectorCredentialsSchema
  })
  .refine(gatewayPickRefiner, { message: GATEWAY_PICK_MESSAGE, path: ["gatewayId"] });

export const UpdateHsmConnectorBodySchema = z
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

export const HsmConnectorIdParamSchema = z.object({
  connectorId: z.string().uuid()
});

export const HsmConnectorLinkedResourcesQuerySchema = z.object({
  offset: z.coerce.number().min(0).default(0),
  limit: z.coerce.number().min(1).max(100).default(20)
});

export const HsmConnectorLinkedResourcesResponseSchema = z.object({
  certificates: z.array(
    z.object({
      id: z.string().uuid(),
      commonName: z.string(),
      status: z.string(),
      notAfter: z.date(),
      hsmKeyLabel: z.string().nullable(),
      createdAt: z.date()
    })
  ),
  certificateAuthorities: z.array(
    z.object({
      id: z.string().uuid(),
      name: z.string(),
      commonName: z.string().nullable(),
      status: z.nativeEnum(CaStatus),
      type: z.nativeEnum(InternalCaType),
      hsmKeyLabel: z.string().nullable(),
      createdAt: z.date()
    })
  ),
  totalCount: z.number()
});
