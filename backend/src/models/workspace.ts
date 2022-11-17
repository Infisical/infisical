import { Schema, model, Types } from 'mongoose';

export interface IWorkspace {
	_id: Types.ObjectId;
	name: string;
	organization: Types.ObjectId;
}

const workspaceSchema = new Schema<IWorkspace>({
	name: {
		type: String,
		required: true
	},
	organization: {
		type: Schema.Types.ObjectId,
		ref: 'Organization',
		required: true
	}
});

const Workspace = model<IWorkspace>('Workspace', workspaceSchema);

export default Workspace;
