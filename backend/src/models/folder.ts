import { Schema, Types, model } from 'mongoose';

const folderSchema = new Schema({
  name: {
    type: String,
    required: true,
  },
  workspace: {
    type: Schema.Types.ObjectId,
    ref: 'Workspace',
    required: true,
  },
  environment: {
    type: String,
    required: true,
  },
  parent: {
    type: Schema.Types.ObjectId,
    ref: 'Folder',
    required: false, // optional for root folders
  },
  path: {
    type: String,
    required: true
  },
  parentPath: {
    type: String,
    required: true,
  },
}, {
  timestamps: true
});

const Folder = model('Folder', folderSchema);

export default Folder;
