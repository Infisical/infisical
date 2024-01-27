import {
  ALGORITHM_AES_256_GCM,
  ENCODING_SCHEME_BASE64,
  ENCODING_SCHEME_UTF8,
  INTEGRATION_AWS_PARAMETER_STORE,
  INTEGRATION_AWS_SECRET_MANAGER,
  INTEGRATION_AZURE_KEY_VAULT,
  INTEGRATION_BITBUCKET,
  INTEGRATION_CIRCLECI,
  INTEGRATION_CLOUDFLARE_PAGES,
  INTEGRATION_CLOUDFLARE_WORKERS,
  INTEGRATION_CLOUD_66,
  INTEGRATION_CODEFRESH,
  INTEGRATION_DIGITAL_OCEAN_APP_PLATFORM,
  INTEGRATION_FLYIO,
  INTEGRATION_GCP_SECRET_MANAGER,
  INTEGRATION_GITHUB,
  INTEGRATION_GITLAB,
  INTEGRATION_HASHICORP_VAULT,
  INTEGRATION_HASURA_CLOUD,
  INTEGRATION_HEROKU,
  INTEGRATION_LARAVELFORGE,
  INTEGRATION_NETLIFY,
  INTEGRATION_NORTHFLANK,
  INTEGRATION_RAILWAY,
  INTEGRATION_RENDER,
  INTEGRATION_SUPABASE,
  INTEGRATION_TEAMCITY,
  INTEGRATION_TERRAFORM_CLOUD,
  INTEGRATION_TRAVISCI,
  INTEGRATION_VERCEL,
  INTEGRATION_WINDMILL
} from "../../variables";
import { Document, Schema, Types, model } from "mongoose";
import { IntegrationAuthMetadata } from "./types";

export interface IIntegrationAuth extends Document {
  _id: Types.ObjectId;
  workspace: Types.ObjectId;
  integration:
    | "heroku"
    | "vercel"
    | "netlify"
    | "github"
    | "gitlab"
    | "render"
    | "railway"
    | "flyio"
    | "azure-key-vault"
    | "laravel-forge"
    | "circleci"
    | "travisci"
    | "supabase"
    | "aws-parameter-store"
    | "aws-secret-manager"
    | "checkly"
    | "qovery"
    | "cloudflare-pages"
    | "cloudflare-workers"
    | "codefresh"
    | "digital-ocean-app-platform"
    | "bitbucket"
    | "cloud-66"
    | "terraform-cloud"
    | "teamcity"
    | "northflank"
    | "windmill"
    | "gcp-secret-manager"
    | "hasura-cloud";
  teamId: string;
  accountId: string;
  url: string;
  namespace: string;
  refreshCiphertext?: string;
  refreshIV?: string;
  refreshTag?: string;
  accessIdCiphertext?: string;
  accessIdIV?: string;
  accessIdTag?: string;
  accessCiphertext?: string;
  accessIV?: string;
  accessTag?: string;
  algorithm?: "aes-256-gcm";
  keyEncoding?: "utf8" | "base64";
  accessExpiresAt?: Date;
  metadata?: IntegrationAuthMetadata;
}

const integrationAuthSchema = new Schema<IIntegrationAuth>(
  {
    workspace: {
      type: Schema.Types.ObjectId,
      ref: "Workspace",
      required: true
    },
    integration: {
      type: String,
      enum: [
        INTEGRATION_AZURE_KEY_VAULT,
        INTEGRATION_AWS_PARAMETER_STORE,
        INTEGRATION_AWS_SECRET_MANAGER,
        INTEGRATION_HEROKU,
        INTEGRATION_VERCEL,
        INTEGRATION_NETLIFY,
        INTEGRATION_GITHUB,
        INTEGRATION_GITLAB,
        INTEGRATION_RENDER,
        INTEGRATION_RAILWAY,
        INTEGRATION_FLYIO,
        INTEGRATION_CIRCLECI,
        INTEGRATION_LARAVELFORGE,
        INTEGRATION_TRAVISCI,
        INTEGRATION_TEAMCITY,
        INTEGRATION_SUPABASE,
        INTEGRATION_TERRAFORM_CLOUD,
        INTEGRATION_HASHICORP_VAULT,
        INTEGRATION_CLOUDFLARE_PAGES,
        INTEGRATION_CLOUDFLARE_WORKERS,
        INTEGRATION_CODEFRESH,
        INTEGRATION_WINDMILL,
        INTEGRATION_BITBUCKET,
        INTEGRATION_DIGITAL_OCEAN_APP_PLATFORM,
        INTEGRATION_CLOUD_66,
        INTEGRATION_NORTHFLANK,
        INTEGRATION_GCP_SECRET_MANAGER,
        INTEGRATION_HASURA_CLOUD
      ],
      required: true
    },
    teamId: {
      // vercel-specific integration param
      type: String
    },
    url: {
      // for any self-hosted integrations (e.g. self-hosted hashicorp-vault)
      type: String
    },
    namespace: {
      // hashicorp-vault-specific integration param
      type: String
    },
    accountId: {
      // netlify-specific integration param
      type: String
    },
    refreshCiphertext: {
      type: String,
      select: false
    },
    refreshIV: {
      type: String,
      select: false
    },
    refreshTag: {
      type: String,
      select: false
    },
    accessIdCiphertext: {
      type: String,
      select: false
    },
    accessIdIV: {
      type: String,
      select: false
    },
    accessIdTag: {
      type: String,
      select: false
    },
    accessCiphertext: {
      type: String,
      select: false
    },
    accessIV: {
      type: String,
      select: false
    },
    accessTag: {
      type: String,
      select: false
    },
    accessExpiresAt: {
      type: Date,
      select: false
    },
    algorithm: {
      // the encryption algorithm used
      type: String,
      enum: [ALGORITHM_AES_256_GCM],
      required: true
    },
    keyEncoding: {
      type: String,
      enum: [ENCODING_SCHEME_UTF8, ENCODING_SCHEME_BASE64],
      required: true
    },
    metadata: {
      type: Schema.Types.Mixed
    }
  },
  {
    timestamps: true
  }
);

export const IntegrationAuth = model<IIntegrationAuth>("IntegrationAuth", integrationAuthSchema);
