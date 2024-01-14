import { Schema, Types, model } from "mongoose";

export type TFolderRootVersionSchema = {
  _id: Types.ObjectId;
  workspace: Types.ObjectId;
  environment: string;
  nodes: TFolderVersionSchema;
};

export type TFolderVersionSchema = {
  id: string;
  name: string;
  version: number;
  children: TFolderVersionSchema[];
};

const folderVersionSchema = new Schema<TFolderVersionSchema>({
  id: {
    required: true,
    type: String,
    default: "root",
  },
  name: {
    required: true,
    type: String,
    default: "root",
  },
  version: {
    required: true,
    type: Number,
    default: 1,
  },
});

folderVersionSchema.add({ children: [folderVersionSchema] });

const folderRootVersionSchema = new Schema<TFolderRootVersionSchema>(
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
    nodes: folderVersionSchema,
  },
  {
    timestamps: true,
  }
);

export const FolderVersion = model<TFolderRootVersionSchema>(
  "FolderVersion",
  folderRootVersionSchema
);