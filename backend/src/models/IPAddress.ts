import { model, Schema, Types } from "mongoose";

export interface IIPAddress {
  _id: Types.ObjectId;
  ip: string;
  user: Types.ObjectId;
  workspace: Types.ObjectId;
}

const ipAddressSchema = new Schema<IIPAddress>(
  {
      ip: {
      type: String,
      required: true,
    },
    user: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    workspace: {
      type: Schema.Types.ObjectId,
      ref: "Workspace",
      required: true,
    },
  },
  {
    timestamps: true,
  }
);

ipAddressSchema.index({ ip: 1, workspace: 1 }, { unique: true });
ipAddressSchema.index({ workspace: 1 });
const IPAddress = model<IIPAddress>("IPAddress", ipAddressSchema);

export default IPAddress;
