import { Schema, model, Types } from 'mongoose';
import {
	ENV_DEV,
	ENV_TESTING,
	ENV_STAGING,
	ENV_PROD,
	INTEGRATION_HEROKU,
	INTEGRATION_NETLIFY
} from '../variables';

export interface IIntegration {
	_id: Types.ObjectId;
	workspace: Types.ObjectId;
	environment: 'dev' | 'test' | 'staging' | 'prod';
	isActive: boolean;
	app: string;
	integration: 'heroku' | 'netlify';
	integrationAuth: Types.ObjectId;
}

const integrationSchema = new Schema<IIntegration>(
	{
		workspace: {
			type: Schema.Types.ObjectId,
			ref: 'Workspace',
			required: true
		},
		environment: {
			type: String,
			enum: [ENV_DEV, ENV_TESTING, ENV_STAGING, ENV_PROD],
			required: true
		},
		isActive: {
			type: Boolean,
			required: true
		},
		app: {
			// name of app in provider
			type: String,
			default: null,
			required: true
		},
		integration: {
			type: String,
			enum: [INTEGRATION_HEROKU, INTEGRATION_NETLIFY],
			required: true
		},
		integrationAuth: {
			type: Schema.Types.ObjectId,
			ref: 'IntegrationAuth',
			required: true
		}
	},
	{
		timestamps: true
	}
);

const Integration = model<IIntegration>('Integration', integrationSchema);

export default Integration;
