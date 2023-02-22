import mongoose, { Schema, model, Types } from 'mongoose';


export interface DesignatedApprovers {
	environment: string,
	approvers: [mongoose.Schema.Types.ObjectId]
}

export interface IWorkspace {
	_id: Types.ObjectId;
	name: string;
	organization: Types.ObjectId;
	approvers: [DesignatedApprovers];
	environments: Array<{
		name: string;
		slug: string;
	}>;
	autoCapitalization: boolean;
}

const workspaceSchema = new Schema<IWorkspace>({
	name: {
		type: String,
		required: true
	},
	autoCapitalization: {
		type: Boolean,
		default: true,
	},
	approvers: [
		{
			userId: {
				type: Schema.Types.ObjectId,
				ref: 'User',
			},
			environment: {
				type: String
			}
		}
	],
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
				name: "Development",
				slug: "dev"
			},
			{
				name: "Test",
				slug: "test"
			},
			{
				name: "Staging",
				slug: "staging"
			},
			{
				name: "Production",
				slug: "prod"
			}
		],
	},
});

workspaceSchema.index({ 'approvers': 1 }, { unique: true });

const Workspace = model<IWorkspace>('Workspace', workspaceSchema);

export default Workspace;
