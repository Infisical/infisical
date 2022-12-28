import { Schema, model, Types } from 'mongoose';

export interface IWorkspace {
	_id: Types.ObjectId;
	name: string;
	organization: Types.ObjectId;
	environments: Array<{
		name: string;
		slug: string;
	}>;
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
	},
	environments: {
		type: [
			{
				name: String,
				slug: String,
			},
		],
		default: [
			{
				name: "development",
				slug: "dev"
			},
			{
				name: "test",
				slug: "test"
			},
			{
				name: "staging",
				slug: "staging"
			},
			{
				name: "production",
				slug: "prod"
			}
		],
	},
});

const Workspace = model<IWorkspace>('Workspace', workspaceSchema);

export default Workspace;
