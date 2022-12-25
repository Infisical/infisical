import { Schema, model, Types } from 'mongoose';
import {
  ENV_DEV,
  ENV_TESTING,
  ENV_STAGING,
  ENV_PROD,
  INTEGRATION_HEROKU,
  INTEGRATION_VERCEL,
  INTEGRATION_NETLIFY,
  INTEGRATION_GITHUB
} from '../variables';

export interface IIntegration {
  _id: Types.ObjectId;
  workspace: Types.ObjectId;
  environment: 'dev' | 'test' | 'staging' | 'prod';
  isActive: boolean;
  app: string;
  target: string;
  context: string;
  siteId: string;
  integration: 'heroku' | 'vercel' | 'netlify' | 'github';
  integrationAuth: Types.ObjectId;
}

const integrationSchema = new Schema<IIntegration>(
  {
    workspace: {
      type: Schema.Types.ObjectId,
      ref: 'Workspace',
      required: true
    },
    environment: {
      type: String,
      enum: [ENV_DEV, ENV_TESTING, ENV_STAGING, ENV_PROD],
      required: true
    },
    isActive: {
      type: Boolean,
      required: true
    },
    app: {
      // name of app in provider
      type: String,
      default: null
    },
    target: {
      // vercel-specific target (environment)
      type: String,
      default: null
    },
    context: {
      // netlify-specific context (deploy)
      type: String,
      default: null
    },
    siteId: {
      // netlify-specific site (app) id
      type: String,
      default: null
    },
    integration: {
      type: String,
      enum: [
        INTEGRATION_HEROKU,
        INTEGRATION_VERCEL,
        INTEGRATION_NETLIFY,
        INTEGRATION_GITHUB
      ],
      required: true
    },
    integrationAuth: {
      type: Schema.Types.ObjectId,
      ref: 'IntegrationAuth',
      required: true
    }
  },
  {
    timestamps: true
  }
);

const Integration = model<IIntegration>('Integration', integrationSchema);

export default Integration;
