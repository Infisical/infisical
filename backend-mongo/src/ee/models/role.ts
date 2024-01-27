import { Schema, Types, model } from "mongoose";

export interface IRole {
  _id: Types.ObjectId;
  name: string;
  description: string;
  slug: string;
  permissions: Array<unknown>;
  workspace: Types.ObjectId;
  organization: Types.ObjectId;
  isOrgRole: boolean;
}

const roleSchema = new Schema<IRole>(
  {
    name: {
      type: String,
      required: true
    },
    organization: {
      type: Schema.Types.ObjectId,
      ref: "Organization",
      required: true
    },
    workspace: {
      type: Schema.Types.ObjectId,
      ref: "Workspace"
    },
    isOrgRole: {
      type: Boolean,
      required: true,
      select: false
    },
    description: {
      type: String
    },
    slug: {
      type: String,
      required: true
    },
    permissions: {
      type: Array,
      required: true
    }
  },
  {
    timestamps: true
  }
);

roleSchema.index({ organization: 1, workspace: 1 });

export const Role = model<IRole>("Role", roleSchema);