import { Schema, model, Types } from 'mongoose';

export interface IUser {
	_id: Types.ObjectId;
	email: string;
	firstName?: string;
	lastName?: string;
	publicKey?: string;
	encryptedPrivateKey?: string;
	iv?: string;
	tag?: string;
	salt?: string;
	verifier?: string;
	refreshVersion?: Number;
}

const userSchema = new Schema<IUser>(
	{
		email: {
			type: String,
			required: true
		},
		firstName: {
			type: String
		},
		lastName: {
			type: String
		},
		publicKey: {
			type: String,
			select: false
		},
		encryptedPrivateKey: {
			type: String,
			select: false
		},
		iv: {
			type: String,
			select: false
		},
		tag: {
			type: String,
			select: false
		},
		salt: {
			type: String,
			select: false
		},
		verifier: {
			type: String,
			select: false
		},
		refreshVersion: {
			type: Number,
			default: 0
		}
	},
	{
		timestamps: true
	}
);

const User = model<IUser>('User', userSchema);

export default User;
