import z from "zod";

import { AppConnections } from "@app/lib/api-docs";
import { AppConnection } from "@app/services/app-connection/app-connection-enums";
import {
  BaseAppConnectionSchema,
  GenericCreateAppConnectionFieldsSchema,
  GenericUpdateAppConnectionFieldsSchema
} from "@app/services/app-connection/app-connection-schemas";

import { APP_CONNECTION_NAME_MAP } from "../app-connection-maps";
import { OVHConnectionMethod } from "./ovh-connection-enums";

const OkmsDomainSchema = z
  .string()
  .trim()
  .min(1, "OVHcloud KMS domain required")
  .url("OVHcloud KMS domain must be a valid URL (e.g. https://eu-west-rbx.okms.ovh.net)")
  .describe(AppConnections.CREDENTIALS.OVH.okmsDomain);
const OkmsIdSchema = z
  .string()
  .trim()
  .min(1, "OVHcloud KMS ID required")
  .describe(AppConnections.CREDENTIALS.OVH.okmsId);

export const OvhConnectionCertificateCredentialsSchema = z.object({
  privateKey: z.string().trim().min(1, "Private key required").describe(AppConnections.CREDENTIALS.OVH.privateKey),
  certificate: z.string().trim().min(1, "Certificate required").describe(AppConnections.CREDENTIALS.OVH.certificate),
  okmsDomain: OkmsDomainSchema,
  okmsId: OkmsIdSchema
});

export const OvhConnectionTokenCredentialsSchema = z.object({
  token: z.string().trim().min(1, "Token required").describe(AppConnections.CREDENTIALS.OVH.token),
  okmsDomain: OkmsDomainSchema,
  okmsId: OkmsIdSchema
});

const BaseOvhConnectionSchema = BaseAppConnectionSchema.extend({ app: z.literal(AppConnection.OVH) });

export const OvhConnectionSchema = z.intersection(
  BaseOvhConnectionSchema,
  z.discriminatedUnion("method", [
    z.object({
      method: z.literal(OVHConnectionMethod.Certificate),
      credentials: OvhConnectionCertificateCredentialsSchema
    }),
    z.object({
      method: z.literal(OVHConnectionMethod.Token),
      credentials: OvhConnectionTokenCredentialsSchema
    })
  ])
);

export const SanitizedOvhConnectionSchema = z.discriminatedUnion("method", [
  BaseOvhConnectionSchema.extend({
    method: z.literal(OVHConnectionMethod.Certificate),
    credentials: OvhConnectionCertificateCredentialsSchema.pick({
      okmsDomain: true,
      okmsId: true
    })
  }).describe(JSON.stringify({ title: `${APP_CONNECTION_NAME_MAP[AppConnection.OVH]} (Certificate)` })),
  BaseOvhConnectionSchema.extend({
    method: z.literal(OVHConnectionMethod.Token),
    credentials: OvhConnectionTokenCredentialsSchema.pick({
      okmsDomain: true,
      okmsId: true
    })
  }).describe(JSON.stringify({ title: `${APP_CONNECTION_NAME_MAP[AppConnection.OVH]} (Token)` }))
]);

export const ValidateOvhConnectionCredentialsSchema = z.discriminatedUnion("method", [
  z.object({
    method: z.literal(OVHConnectionMethod.Certificate).describe(AppConnections.CREATE(AppConnection.OVH).method),
    credentials: OvhConnectionCertificateCredentialsSchema.describe(
      AppConnections.CREATE(AppConnection.OVH).credentials
    )
  }),
  z.object({
    method: z.literal(OVHConnectionMethod.Token).describe(AppConnections.CREATE(AppConnection.OVH).method),
    credentials: OvhConnectionTokenCredentialsSchema.describe(AppConnections.CREATE(AppConnection.OVH).credentials)
  })
]);

export const CreateOvhConnectionSchema = ValidateOvhConnectionCredentialsSchema.and(
  GenericCreateAppConnectionFieldsSchema(AppConnection.OVH)
);

export const UpdateOvhConnectionSchema = z
  .object({
    credentials: z
      .union([OvhConnectionCertificateCredentialsSchema, OvhConnectionTokenCredentialsSchema])
      .optional()
      .describe(AppConnections.UPDATE(AppConnection.OVH).credentials)
  })
  .and(GenericUpdateAppConnectionFieldsSchema(AppConnection.OVH));

export const OvhConnectionListItemSchema = z
  .object({
    name: z.literal("OVHcloud"),
    app: z.literal(AppConnection.OVH),
    methods: z.nativeEnum(OVHConnectionMethod).array()
  })
  .describe(JSON.stringify({ title: APP_CONNECTION_NAME_MAP[AppConnection.OVH] }));
