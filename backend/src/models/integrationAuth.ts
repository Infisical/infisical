import { Schema, model, Types } from "mongoose";
import {
  INTEGRATION_AZURE_KEY_VAULT,
  INTEGRATION_AWS_PARAMETER_STORE,
  INTEGRATION_AWS_SECRET_MANAGER,
  INTEGRATION_HEROKU,
  INTEGRATION_VERCEL,
  INTEGRATION_NETLIFY,
  INTEGRATION_GITHUB,
  INTEGRATION_RENDER,
  INTEGRATION_FLYIO,
  INTEGRATION_CIRCLECI,
} from "../variables";

export interface IIntegrationAuth {
  _id: Types.ObjectId;
  workspace: Types.ObjectId;
  integration:
    | 'azure-key-vault'
    | 'aws-parameter-store'
    | 'aws-secret-manager'
    | 'heroku' 
    | 'vercel' 
    | 'netlify' 
    | 'github' 
    | 'render' 
    | 'flyio'
    | 'circleci';
  teamId: string; // TODO: deprecate (vercel) -> move to accessId
  accountId: string; // TODO: deprecate (netlify) -> move to accessId
  refreshCiphertext?: string;
  refreshIV?: string;
  refreshTag?: string;
  accessIdCiphertext?: string; // new
  accessIdIV?: string; // new
  accessIdTag?: string; // new
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
        INTEGRATION_RENDER,
        INTEGRATION_FLYIO,
        INTEGRATION_CIRCLECI,
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
