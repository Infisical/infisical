import { Schema, model, Types } from "mongoose";
import {
  INTEGRATION_AZURE_KEY_VAULT,
  INTEGRATION_HEROKU,
  INTEGRATION_VERCEL,
  INTEGRATION_NETLIFY,
  INTEGRATION_GITHUB,
  INTEGRATION_RENDER,
  INTEGRATION_FLYIO,
  INTEGRATION_CIRCLECI,
} from "../variables";

export interface IIntegration {
  _id: Types.ObjectId;
  workspace: Types.ObjectId;
  environment: string;
  isActive: boolean;
  app: string;
  owner: string;
  targetEnvironment: string;
  appId: string;
  integration:
    | "heroku"
    | "vercel"
    | "netlify"
    | "github"
    | "render"
    | "flyio"
    | "azure-key-vault"
    | "circleci";
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
    app: {
      // name of app in provider
      type: String,
      default: null,
    },
    appId: {
      // (new)
      // id of app in provider
      type: String,
      default: null,
    },
    targetEnvironment: {
      // (new)
      // target environment
      type: String,
      default: null,
    },
    owner: {
      // github-specific repo owner-login
      type: String,
      default: null,
    },
    integration: {
      type: String,
      enum: [
        INTEGRATION_AZURE_KEY_VAULT,
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
