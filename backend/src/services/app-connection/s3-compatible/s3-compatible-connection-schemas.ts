import RE2 from "re2";
import z from "zod";

import { AppConnections } from "@app/lib/api-docs";
import { AppConnection, AWSRegion } from "@app/services/app-connection/app-connection-enums";
import {
  BaseAppConnectionSchema,
  GenericCreateAppConnectionFieldsSchema,
  GenericUpdateAppConnectionFieldsSchema
} from "@app/services/app-connection/app-connection-schemas";

import { APP_CONNECTION_NAME_MAP } from "../app-connection-maps";
import { S3CompatibleConnectionMethod, S3CompatibleProvider } from "./s3-compatible-connection-enums";

const AWS_S3_HOSTNAME = new RE2(/^s3\.([a-z0-9-]+)\.amazonaws\.com$/);
// the optional label is the bucket jurisdiction (eu, us, fedramp)
const R2_HOSTNAME = new RE2(/^[a-f0-9]{32}(\.[a-z]+)?\.r2\.cloudflarestorage\.com$/);
const OCI_HOSTNAME = new RE2(
  /^[a-z0-9-]+\.compat\.objectstorage\.([a-z0-9-]+)\.(?:oraclecloud\.com|oci\.customer-oci\.com)$/
);

export const S3_COMPATIBLE_PROVIDER_MAP: Record<
  S3CompatibleProvider,
  {
    name: string;
    endpointExample: string;
    getSigningRegion: (hostname: string) => string | null;
  }
> = {
  [S3CompatibleProvider.AwsS3]: {
    name: "AWS S3",
    endpointExample: "https://s3.<region>.amazonaws.com",
    getSigningRegion: (hostname) => {
      const region = AWS_S3_HOSTNAME.exec(hostname)?.[1];
      return region && (Object.values(AWSRegion) as string[]).includes(region) ? region : null;
    }
  },
  [S3CompatibleProvider.CloudflareR2]: {
    name: "Cloudflare R2",
    endpointExample: "https://<account-id>.r2.cloudflarestorage.com",
    getSigningRegion: (hostname) => (R2_HOSTNAME.test(hostname) ? "auto" : null)
  },
  [S3CompatibleProvider.GoogleCloudStorage]: {
    name: "Google Cloud Storage",
    endpointExample: "https://storage.googleapis.com",
    getSigningRegion: (hostname) => (hostname === "storage.googleapis.com" ? "auto" : null)
  },
  [S3CompatibleProvider.OciObjectStorage]: {
    name: "OCI Object Storage",
    endpointExample: "https://<namespace>.compat.objectstorage.<region>.oraclecloud.com",
    getSigningRegion: (hostname) => OCI_HOSTNAME.exec(hostname)?.[1] ?? null
  }
};

export const parseS3CompatibleEndpoint = (endpoint: string) => {
  let url: URL;
  try {
    url = new URL(endpoint);
  } catch {
    return null;
  }

  if (
    url.protocol !== "https:" ||
    url.port ||
    url.username ||
    url.password ||
    url.pathname !== "/" ||
    url.search ||
    url.hash
  ) {
    return null;
  }

  for (const provider of Object.values(S3CompatibleProvider)) {
    const region = S3_COMPATIBLE_PROVIDER_MAP[provider].getSigningRegion(url.hostname);
    if (region) return { provider, region, origin: url.origin };
  }
  return null;
};

const S3_COMPATIBLE_ENDPOINT_ERROR = `Endpoint must be the S3 API endpoint of a supported provider, without a bucket name: ${Object.values(
  S3_COMPATIBLE_PROVIDER_MAP
)
  .map(({ name, endpointExample }) => `${endpointExample} (${name})`)
  .join(", ")}`;

export const S3CompatibleConnectionAccessKeyCredentialsSchema = z.object({
  endpoint: z
    .string()
    .trim()
    .min(1, "Endpoint required")
    .max(256, "Endpoint cannot exceed 256 characters")
    .refine((endpoint) => Boolean(parseS3CompatibleEndpoint(endpoint)), S3_COMPATIBLE_ENDPOINT_ERROR)
    .describe(AppConnections.CREDENTIALS.S3_COMPATIBLE.endpoint),
  accessKeyId: z
    .string()
    .trim()
    .min(1, "Access Key ID required")
    .max(256, "Access Key ID cannot exceed 256 characters")
    .describe(AppConnections.CREDENTIALS.S3_COMPATIBLE.accessKeyId),
  secretAccessKey: z
    .string()
    .trim()
    .min(1, "Secret Access Key required")
    .max(256, "Secret Access Key cannot exceed 256 characters")
    .describe(AppConnections.CREDENTIALS.S3_COMPATIBLE.secretAccessKey)
});

const BaseS3CompatibleConnectionSchema = BaseAppConnectionSchema.extend({
  app: z.literal(AppConnection.S3Compatible)
});

export const S3CompatibleConnectionSchema = BaseS3CompatibleConnectionSchema.extend({
  method: z.literal(S3CompatibleConnectionMethod.AccessKey),
  credentials: S3CompatibleConnectionAccessKeyCredentialsSchema
});

export const SanitizedS3CompatibleConnectionSchema = z.discriminatedUnion("method", [
  BaseS3CompatibleConnectionSchema.extend({
    method: z.literal(S3CompatibleConnectionMethod.AccessKey),
    credentials: S3CompatibleConnectionAccessKeyCredentialsSchema.pick({ endpoint: true, accessKeyId: true })
  }).describe(JSON.stringify({ title: `${APP_CONNECTION_NAME_MAP[AppConnection.S3Compatible]} (Access Key)` }))
]);

export const ValidateS3CompatibleConnectionCredentialsSchema = z.discriminatedUnion("method", [
  z.object({
    method: z
      .literal(S3CompatibleConnectionMethod.AccessKey)
      .describe(AppConnections.CREATE(AppConnection.S3Compatible).method),
    credentials: S3CompatibleConnectionAccessKeyCredentialsSchema.describe(
      AppConnections.CREATE(AppConnection.S3Compatible).credentials
    )
  })
]);

export const CreateS3CompatibleConnectionSchema = ValidateS3CompatibleConnectionCredentialsSchema.and(
  GenericCreateAppConnectionFieldsSchema(AppConnection.S3Compatible)
);

export const UpdateS3CompatibleConnectionSchema = z
  .object({
    credentials: S3CompatibleConnectionAccessKeyCredentialsSchema.optional().describe(
      AppConnections.UPDATE(AppConnection.S3Compatible).credentials
    )
  })
  .and(GenericUpdateAppConnectionFieldsSchema(AppConnection.S3Compatible));

export const S3CompatibleConnectionListItemSchema = z
  .object({
    name: z.literal("S3-Compatible Storage"),
    app: z.literal(AppConnection.S3Compatible),
    methods: z.nativeEnum(S3CompatibleConnectionMethod).array()
  })
  .describe(JSON.stringify({ title: APP_CONNECTION_NAME_MAP[AppConnection.S3Compatible] }));
