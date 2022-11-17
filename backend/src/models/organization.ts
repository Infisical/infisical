import { Schema, model, Types } from 'mongoose';

export interface IOrganization {
	_id: Types.ObjectId;
	name: string;
	customerId?: string;
}

const organizationSchema = new Schema<IOrganization>(
	{
		name: {
			type: String,
			required: true
		},
		customerId: {
			type: String
		}
	},
	{
		timestamps: true
	}
);

const Organization = model<IOrganization>('Organization', organizationSchema);

export default Organization;
