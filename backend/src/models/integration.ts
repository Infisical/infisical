import { Schema, model, Types } from "mongoose";
import {
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
  INTEGRATION_TRAVISCI,
  INTEGRATION_SUPABASE,
  INTEGRATION_CHECKLY
} from "../variables";

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
  integration:
    | 'azure-key-vault' 
    | 'aws-parameter-store'
    | 'aws-secret-manager'
    | 'heroku' 
    | 'vercel' 
    | 'netlify' 
    | 'github'
    | 'gitlab'
    | 'render' 
    | 'railway' 
    | 'flyio'
    | 'circleci'
    | 'travisci'
    | 'supabase'
    | 'checkly';
  integrationAuth: Types.ObjectId;
}

const integrationSchema = new Schema<IIntegration>(
  {
    workspace: {
      type: Schema.Types.ObjectId,
      ref: "Workspace",
      required: true,
    },
    environment: {
      type: String,
      required: true,
    },
    isActive: {
      type: Boolean,
      required: true,
    },
    url: {
      // for custom self-hosted integrations (e.g. self-hosted GitHub enterprise)
      type: String,
      default: null
    },
    app: {
      // name of app in provider
      type: String,
      default: null,
    },
    appId: {
      // id of app in provider
      type: String,
      default: null,
    },
    targetEnvironment: {
      // target environment
      type: String,
      default: null,
    },
    targetEnvironmentId: {
      type: String,
      default: null
    },
    targetService: {
      // railway-specific service
      type: String,
      default: null
    },
    targetServiceId: {
      // railway-specific service
      type: String,
      default: null
    },
    owner: {
      // github-specific repo owner-login
      type: String,
      default: null,
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
        INTEGRATION_TRAVISCI,
        INTEGRATION_SUPABASE,
        INTEGRATION_CHECKLY
      ],
      required: true,
    },
    integrationAuth: {
      type: Schema.Types.ObjectId,
      ref: "IntegrationAuth",
      required: true,
    },
  },
  {
    timestamps: true,
  }
);

const Integration = model<IIntegration>("Integration", integrationSchema);

export default Integration;
