import { Schema, model, Types } from "mongoose";

export interface ISecretSnapshot {
  workspace: Types.ObjectId;
  environment: string;
  folderId: string | "root";
  version: number;
  secretVersions: Types.ObjectId[];
  folderVersion: Types.ObjectId;
}

const secretSnapshotSchema = new Schema<ISecretSnapshot>(
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
    folderId: {
      type: String,
      default: "root",
    },
    version: {
      type: Number,
      default: 1,
      required: true,
    },
    secretVersions: [
      {
        type: Schema.Types.ObjectId,
        ref: "SecretVersion",
        required: true,
      },
    ],
    folderVersion: {
      type: Schema.Types.ObjectId,
      ref: "FolderVersion",
    },
  },
  {
    timestamps: true,
  }
);

const SecretSnapshot = model<ISecretSnapshot>(
  "SecretSnapshot",
  secretSnapshotSchema
);

export default SecretSnapshot;
