import { Schema, Types, model } from "mongoose";

export interface ISecretImports {
  _id: Types.ObjectId;
  workspace: Types.ObjectId;
  environment: string;
  folderId: string;
  imports: Array<{
    environment: string;
    secretPath: string;
  }>;
}

const secretImportSchema = new Schema<ISecretImports>(
  {
    workspace: {
      type: Schema.Types.ObjectId,
      ref: "Workspace",
      required: true
    },
    environment: {
      type: String,
      required: true
    },
    folderId: {
      type: String,
      required: true,
      default: "root"
    },
    imports: {
      type: [
        {
          environment: {
            type: String,
            required: true
          },
          secretPath: {
            type: String,
            required: true
          }
        }
      ],
      default: []
    }
  },
  {
    timestamps: true
  }
);

export const SecretImport = model<ISecretImports>("SecretImports", secretImportSchema);