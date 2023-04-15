import { Schema, model, Types } from 'mongoose';
import {
	WORKSPACE_ENCRYPTION_MODE_E2EE,
	WORKSPACE_ENCRYPTION_MODE_BLIND_INDEXED_E2EE,
	WORKSPACE_ENCRYPTION_MODE_NOT_E2EE
} from '../variables';

export interface IWorkspace {
	_id: Types.ObjectId;
	name: string;
	encryptionMode: string;
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
		required: true
	},
	encryptionMode: {
		type: String,
		default: 'e2ee',
		enum: [
			WORKSPACE_ENCRYPTION_MODE_E2EE,
			WORKSPACE_ENCRYPTION_MODE_BLIND_INDEXED_E2EE,
			WORKSPACE_ENCRYPTION_MODE_NOT_E2EE
		]
	},
	autoCapitalization: {
		type: Boolean,
		default: true,
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

const Workspace = model<IWorkspace>('Workspace', workspaceSchema);

export default Workspace;
