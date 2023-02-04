import { Schema, model, Types } from "mongoose";
import {
  INTEGRATION_HEROKU,
  INTEGRATION_VERCEL,
  INTEGRATION_NETLIFY,
  INTEGRATION_GITHUB,
} from "../variables";

export interface IIntegrationAuth {
  _id: Types.ObjectId;
  workspace: Types.ObjectId;
  integration:
    | "heroku"
    | "vercel"
    | "netlify"
    | "github"
    | "render"
    | "flyio"
    | "circleci";
  teamId: string;
  accountId: string;
  refreshCiphertext?: string;
  refreshIV?: string;
  refreshTag?: string;
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
        INTEGRATION_HEROKU,
        INTEGRATION_VERCEL,
        INTEGRATION_NETLIFY,
        INTEGRATION_GITHUB,
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
