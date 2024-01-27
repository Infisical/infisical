import { Schema, Types, model } from "mongoose";

export type TFolderRootSchema = {
  _id: Types.ObjectId;
  workspace: Types.ObjectId;
  environment: string;
  nodes: TFolderSchema;
};

export type TFolderSchema = {
  id: string;
  name: string;
  version: number;
  children: TFolderSchema[];
};

const folderSchema = new Schema<TFolderSchema>({
  id: {
    required: true,
    type: String,
  },
  version: {
    required: true,
    type: Number,
    default: 1,
  },
  name: {
    required: true,
    type: String,
    default: "root",
  },
});

folderSchema.add({ children: [folderSchema] });

const folderRootSchema = new Schema<TFolderRootSchema>(
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
    nodes: folderSchema,
  },
  {
    timestamps: true,
  }
);

export const Folder = model<TFolderRootSchema>("Folder", folderRootSchema);