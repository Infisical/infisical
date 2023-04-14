import { Schema, model, Types, Document } from "mongoose";
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
  INTEGRATION_GCP_SECRET_MANAGER,
  INTEGRATION_TRAVISCI,
  INTEGRATION_SUPABASE,
} from "../variables";

export interface IIntegrationAuth extends Document {
  _id: Types.ObjectId;
  workspace: Types.ObjectId;
  integration: 'heroku' | 'vercel' | 'netlify' | 'github' | 'gitlab' | 'render' | 'railway' | 'flyio' | 'azure-key-vault' | 'circleci' | 'travisci' | 'supabase' | 'aws-parameter-store' | 'aws-secret-manager' | 'gcp-secret-manager';
  teamId: string;
  accountId: string;
  refreshCiphertext?: string;
  refreshIV?: string;
  refreshTag?: string;
  accessIdCiphertext?: string;
  accessIdIV?: string;
  accessIdTag?: string;
  accessCiphertext?: string;
  accessIV?: string;
  accessTag?: string;
  accessExpiresAt?: Date;
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
        INTEGRATION_GCP_SECRET_MANAGER,
        INTEGRATION_TRAVISCI,
        INTEGRATION_SUPABASE
      ],
      required: true,
    },
    teamId: {
      // vercel-specific integration param
      type: String,
    },
    accountId: {
      // netlify-specific integration param
      type: String,
    },
    refreshCiphertext: {
      type: String,
      select: false,
    },
    refreshIV: {
      type: String,
      select: false,
    },
    refreshTag: {
      type: String,
      select: false,
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
      select: false,
    },
    accessIV: {
      type: String,
      select: false,
    },
    accessTag: {
      type: String,
      select: false,
    },
    accessExpiresAt: {
      type: Date,
      select: false,
    },
  },
  {
    timestamps: true,
  }
);

const IntegrationAuth = model<IIntegrationAuth>(
  "IntegrationAuth",
  integrationAuthSchema
);

export default IntegrationAuth;
