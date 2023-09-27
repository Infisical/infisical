import { Document, Schema, Types, model } from "mongoose";

export enum AuthMethod {
	EMAIL = "email",
	GOOGLE = "google",
	GITHUB = "github",
	OKTA_SAML = "okta-saml",
	AZURE_SAML = "azure-saml",
	JUMPCLOUD_SAML = "jumpcloud-saml",
}

export enum MfaMethod {
	EMAIL = "email",
	AUTH_APP = "auth-app",
	MFA_RECOVERY_CODES = "mfa-recovery-codes"
}

export interface IUser extends Document {
	_id: Types.ObjectId;
	authProvider?: AuthMethod;
	authMethods: AuthMethod[];
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
		devices: {
		ip: string;
		userAgent: string;
	}[];
	isMfaEnabled: boolean;
  mfaMethods?: MfaMethod[]; // note: changed from boolean (need to deprecate this properly!!!)
	mfaPreference?: MfaMethod;
	authAppSecretKeyCipherText?: string,
	authAppSecretKeyIV?: string,
	authAppSecretKeyTag?: string,
	mfaRecoveryCodesCipherText?: string[],
	mfaRecoveryCodesIV?: string[],
	mfaRecoveryCodesTag?: string[],
	mfaRecoveryCodesCount?: {
    startCount: number;
    currentCount: number;
  }[];
}

const userSchema = new Schema<IUser>(
	{
		authProvider: { // TODO field: deprecate
			type: String,
			enum: AuthMethod,
		},
		authMethods: {
			type: [{
				type: String,
				enum: AuthMethod,
			}],
			default: [AuthMethod.EMAIL],
			required: true
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
		devices: { // user devices
			type: [{
				ip: String,
				userAgent: String,
			}],
			default: [],
			select: false,
		},
		isMfaEnabled: {
			type: Boolean,
			default: false,
		},
		mfaMethods: [{ 
			type: String,
		}],
		mfaPreference: {
			type: String,
		},
		authAppSecretKeyCipherText: {
			type: String,
			select: false,
		},
		authAppSecretKeyIV: {
			type: String,
			select: false,
		},
		authAppSecretKeyTag: {
			type: String,
			select: false,
		},
		mfaRecoveryCodesCipherText: [{
			type: String,
			select: false,
		}],
		mfaRecoveryCodesIV: [{
			type: String,
			select: false,
		}],
		mfaRecoveryCodesTag: [{
			type: String,
			select: false,
		}],
		mfaRecoveryCodesCount: [
			{
				startCount: {
					type: Number,
					min: 4,
					max: 16,
				},
				currentCount: {
					type: Number,
					min: 0,
					max: 16,
				},
			},
		],
	}, 
	{
		timestamps: true,
	}
);

export const User = model<IUser>("User", userSchema);