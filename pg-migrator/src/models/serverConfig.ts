import { Schema, Types, model } from "mongoose";

export interface IServerConfig {
  _id: Types.ObjectId;
  initialized: boolean;
  allowSignUp: boolean;
}

const serverConfigSchema = new Schema<IServerConfig>(
  {
    initialized: {
      type: Boolean,
      default: false
    },
    allowSignUp: {
      type: Boolean,
      default: true
    }
  },
  {
    timestamps: true
  }
);

export const ServerConfig = model<IServerConfig>("ServerConfig", serverConfigSchema);
