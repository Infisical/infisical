import { Schema, model } from "mongoose";

type Installation = {
  installationId: string
  organizationId: string
  user: Schema.Types.ObjectId
};


const gitAppOrganizationInstallation = new Schema<Installation>({
  installationId: {
    type: String,
    required: true,
    unique: true
  },
  organizationId: {
    type: String,
    required: true,
    unique: true
  },
  user: {
    type: Schema.Types.ObjectId,
    ref: "User",
    required: true,
  }
});


export const GitAppOrganizationInstallation = model<Installation>("git_app_organization_installation", gitAppOrganizationInstallation);