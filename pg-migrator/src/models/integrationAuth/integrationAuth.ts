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
      required: true,
    },
    integration: {
      type: String,
      required: true,
    },
    teamId: {
      // vercel-specific integration param
      type: String,
    },
    url: {
      // for any self-hosted integrations (e.g. self-hosted hashicorp-vault)
      type: String,
    },
    namespace: {
      // hashicorp-vault-specific integration param
      type: String,
    },
    accountId: {
      // netlify-specific integration param
      type: String,
    },
    refreshCiphertext: {
      type: String,
      
    },
    refreshIV: {
      type: String,
      
    },
    refreshTag: {
      type: String,
      
    },
    accessIdCiphertext: {
      type: String,
      
    },
    accessIdIV: {
      type: String,
      
    },
    accessIdTag: {
      type: String,
      
    },
    accessCiphertext: {
      type: String,
      
    },
    accessIV: {
      type: String,
      
    },
    accessTag: {
      type: String,
      
    },
    accessExpiresAt: {
      type: Date,
      
    },
    algorithm: {
      // the encryption algorithm used
      type: String,
      required: true,
    },
    keyEncoding: {
      type: String,
      required: true,
    },
    metadata: {
      type: Schema.Types.Mixed,
    },
  },
  {
    timestamps: true,
  },
);

export const IntegrationAuth = model<IIntegrationAuth>(
  "IntegrationAuth",
  integrationAuthSchema,
);
