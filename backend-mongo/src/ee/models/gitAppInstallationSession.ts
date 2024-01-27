import { Schema, Types, model } from "mongoose";

type GitAppInstallationSession = {
  id: string;
  sessionId: string;
  organization: Types.ObjectId;
  user: Types.ObjectId;
}

const gitAppInstallationSession = new Schema<GitAppInstallationSession>({
  id: {
    required: true,
    type: String,
  },
  sessionId: {
    type: String,
    required: true,
    unique: true
  },
  organization: {
    type: Schema.Types.ObjectId,
    required: true,
    unique: true
  },
  user: {
    type: Schema.Types.ObjectId,
    ref: "User"
  }
});


export const GitAppInstallationSession = model<GitAppInstallationSession>("git_app_installation_session", gitAppInstallationSession);