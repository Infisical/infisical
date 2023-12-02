import {
  INTEGRATION_AWS_PARAMETER_STORE,
  INTEGRATION_AWS_SECRET_MANAGER,
  INTEGRATION_AZURE_KEY_VAULT,
  INTEGRATION_BITBUCKET,
  INTEGRATION_CHECKLY,
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
  INTEGRATION_QOVERY,
  INTEGRATION_RAILWAY,
  INTEGRATION_RENDER,
  INTEGRATION_SUPABASE,
  INTEGRATION_TEAMCITY,
  INTEGRATION_TERRAFORM_CLOUD,
  INTEGRATION_TRAVISCI,
  INTEGRATION_VERCEL,
  INTEGRATION_WINDMILL
} from "../../variables";
import { Schema, Types, model } from "mongoose";
import { Metadata } from "./types";

export interface IIntegration {
  _id: Types.ObjectId;
  workspace: Types.ObjectId;
  environment: string;
  isActive: boolean;
  url: string;
  app: string;
  appId: string;
  owner: string;
  targetEnvironment: string;
  targetEnvironmentId: string;
  targetService: string;
  targetServiceId: string;
  path: string;
  region: string;
  scope: string;
  secretPath: string;
  integration:
    | "azure-key-vault"
    | "aws-parameter-store"
    | "aws-secret-manager"
    | "heroku"
    | "vercel"
    | "netlify"
    | "github"
    | "gitlab"
    | "render"
    | "railway"
    | "flyio"
    | "circleci"
    | "laravel-forge"
    | "travisci"
    | "supabase"
    | "checkly"
    | "qovery"
    | "terraform-cloud"
    | "teamcity"
    | "hashicorp-vault"
    | "cloudflare-pages"
    | "cloudflare-workers"
    | "bitbucket"
    | "codefresh"
    | "digital-ocean-app-platform"
    | "cloud-66"
    | "northflank"
    | "windmill"
    | "gcp-secret-manager"
    | "hasura-cloud";
  integrationAuth: Types.ObjectId;
  metadata: Metadata;
}

const integrationSchema = new Schema<IIntegration>(
  {
    workspace: {
      type: Schema.Types.ObjectId,
      ref: "Workspace",
      required: true
    },
    environment: {
      type: String,
      required: true
    },
    isActive: {
      type: Boolean,
      required: true
    },
    url: {
      // for custom self-hosted integrations (e.g. self-hosted GitHub enterprise)
      type: String,
      default: null
    },
    app: {
      // name of app in provider
      type: String,
      default: null
    },
    appId: {
      // id of app in provider
      type: String,
      default: null
    },
    targetEnvironment: {
      // target environment
      type: String,
      default: null
    },
    targetEnvironmentId: {
      type: String,
      default: null
    },
    targetService: {
      // railway-specific service
      // qovery-specific project
      type: String,
      default: null
    },
    targetServiceId: {
      // railway-specific service
      // qovery specific project
      type: String,
      default: null
    },
    owner: {
      // github-specific repo owner-login
      type: String,
      default: null
    },
    path: {
      // aws-parameter-store-specific path
      // (also) vercel preview-branch
      type: String,
      default: null
    },
    region: {
      // aws-parameter-store-specific path
      type: String,
      default: null
    },
    scope: {
      // qovery-specific scope
      type: String,
      default: null
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
        INTEGRATION_SUPABASE,
        INTEGRATION_CHECKLY,
        INTEGRATION_QOVERY,
        INTEGRATION_TERRAFORM_CLOUD,
        INTEGRATION_TEAMCITY,
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
    integrationAuth: {
      type: Schema.Types.ObjectId,
      ref: "IntegrationAuth",
      required: true
    },
    secretPath: {
      type: String,
      required: true,
      default: "/"
    },
    metadata: {
      type: Schema.Types.Mixed,
      default: {}
    }
  },
  {
    timestamps: true
  }
);

export const Integration = model<IIntegration>("Integration", integrationSchema);
