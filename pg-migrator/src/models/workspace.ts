import { Schema, Types, model } from "mongoose";

export interface IWorkspace {
	_id: Types.ObjectId;
	name: string;
	organization: Types.ObjectId;
	environments: Array<{
		name: string;
		slug: string;
	}>;
	autoCapitalization: boolean;
}

const workspaceSchema = new Schema<IWorkspace>({
	name: {
		type: String,
		required: true,
	},
	autoCapitalization: {
		type: Boolean,
		default: true,
	},
	organization: {
		type: Schema.Types.ObjectId,
		ref: "Organization",
		required: true,
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
				slug: "dev",
			},
			{
				name: "Staging",
				slug: "staging",
			},
			{
				name: "Production",
				slug: "prod",
			},
		],
	},
});

export const Workspace = model<IWorkspace>("Workspace", workspaceSchema);