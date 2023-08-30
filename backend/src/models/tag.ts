import { Schema, Types, model } from "mongoose";

export interface ITag {
	_id: Types.ObjectId;
	name: string;
	tagColor: string;
	slug: string;
	user: Types.ObjectId;
	workspace: Types.ObjectId;
}

const tagSchema = new Schema<ITag>(
	{
		name: {
			type: String,
			required: true,
			trim: true,
		},
		tagColor: {
			type: String,
			required: false,
			trim: true,
		},
		slug: {
			type: String,
			required: true,
			trim: true,
			lowercase: true,
			validate: [
				function (value: any) {
					return value.indexOf(" ") === -1;
				},
				"slug cannot contain spaces",
			],
		},
		user: {
			type: Schema.Types.ObjectId,
			ref: "User",
		},
		workspace: {
			type: Schema.Types.ObjectId,
			ref: "Workspace",
		},
	},
	{
		timestamps: true,
	}
);

tagSchema.index({ slug: 1, workspace: 1 }, { unique: true })
tagSchema.index({ workspace: 1 })

export const Tag = model<ITag>("Tag", tagSchema);