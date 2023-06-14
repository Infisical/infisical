var mongoose = require('mongoose');

var userSchema = new mongoose.Schema(
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
		encryptionVersion: {
			type: Number,
			select: false,
			default: 1 // to resolve backward-compatibility issues
		},
		protectedKey: { // introduced as part of encryption version 2
			type: String,
			select: false
		},
		protectedKeyIV: { // introduced as part of encryption version 2
			type: String,
			select: false
		},
		protectedKeyTag: { // introduced as part of encryption version 2
			type: String,
			select: false
		},
		publicKey: {
			type: String,
			select: false
		},
		encryptedPrivateKey: {
			type: String,
			select: false
		},
		iv: { // iv of [encryptedPrivateKey]
			type: String,
			select: false
		},
		tag: { // tag of [encryptedPrivateKey]
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
			default: 0,
			select: false
		},
		isMfaEnabled: {
			type: Boolean,
			default: false
		},
		mfaMethods: [{
			type: String
		}],
		devices: {
			type: [{
				ip: String,
				userAgent: String
			}],
			default: []
		}
	}, 
	{
		timestamps: true
	}
);

var User = mongoose.model('User', userSchema);

module.exports = User;
