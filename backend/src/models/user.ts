import { Document, Schema, Types, model } from "mongoose";

export enum AuthProvider {
	EMAIL = "email",
	GOOGLE = "google",
	OKTA_SAML = "okta-saml",
	AZURE_SAML = "azure-saml",
	JUMPCLOUD_SAML = "jumpcloud-saml",
}

export interface IUser extends Document {
	_id: Types.ObjectId;
	authId?: string;
	authProvider?: AuthProvider;
	email: string;
	firstName?: string;
	lastName?: string;
	encryptionVersion: number;
	protectedKey: string;
	protectedKeyIV: string;
	protectedKeyTag: string;
	publicKey?: string;
	encryptedPrivateKey?: string;
	iv?: string;
	tag?: string;
	salt?: string;
	verifier?: string;
	isMfaEnabled: boolean;
	mfaMethods: boolean;
	devices: {
		ip: string;
		userAgent: string;
	}[];
}

const userSchema = new Schema<IUser>(
	{
		authId: {
			type: String,
		},
		authProvider: {
			type: String,
			enum: AuthProvider,
		},
		email: {
			type: String,
			required: true,
			unique: true,
		},
		firstName: {
			type: String,
		},
		lastName: {
			type: String,
		},
		encryptionVersion: {
			type: Number,
			select: false,
			default: 1, // to resolve backward-compatibility issues
		},
		protectedKey: { // introduced as part of encryption version 2
			type: String,
			select: false,
		},
		protectedKeyIV: { // introduced as part of encryption version 2
			type: String,
			select: false,
		},
		protectedKeyTag: { // introduced as part of encryption version 2
			type: String,
			select: false,
		},
		publicKey: {
			type: String,
			select: false,
		},
		encryptedPrivateKey: {
			type: String,
			select: false,
		},
		iv: { // iv of [encryptedPrivateKey]
			type: String,
			select: false,
		},
		tag: { // tag of [encryptedPrivateKey]
			type: String,
			select: false,
		},
		salt: {
			type: String,
			select: false,
		},
		verifier: {
			type: String,
			select: false,
		},
		isMfaEnabled: {
			type: Boolean,
			default: false,
		},
		mfaMethods: [{
			type: String,
		}],
		devices: {
			type: [{
				ip: String,
				userAgent: String,
			}],
			default: [],
			select: false,
		},
	}, 
	{
		timestamps: true,
	}
);

const User = model<IUser>("User", userSchema);

export default User;
