import { Schema, model, Types } from 'mongoose';

export interface IIncidentContactOrg {
	_id: Types.ObjectId;
	email: string;
	organization: Types.ObjectId;
}

const incidentContactOrgSchema = new Schema<IIncidentContactOrg>(
	{
		email: {
			type: String,
			required: true
		},
		organization: {
			type: Schema.Types.ObjectId,
			ref: 'Organization',
			required: true
		}
	},
	{
		timestamps: true
	}
);

const IncidentContactOrg = model<IIncidentContactOrg>(
	'IncidentContactOrg',
	incidentContactOrgSchema
);

export default IncidentContactOrg;
