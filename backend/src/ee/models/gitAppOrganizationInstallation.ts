import { Schema, model } from "mongoose";

type GitAppOrganizationInstallation = {
  installationId: string
  organizationId: string
  user: Schema.Types.ObjectId
};


const gitAppOrganizationInstallation = new Schema<GitAppOrganizationInstallation>({
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


export const GitAppOrganizationInstallation = model<GitAppOrganizationInstallation>("git_app_organization_installation", gitAppOrganizationInstallation);
