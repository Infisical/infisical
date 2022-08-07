#! /usr/bin/env node
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const netrc = require('netrc-rw');
const {
	read,
	parse
} = require('../utilities/file');
const {
	encryptSymmetric,
	decryptSymmetric,
	encryptAssymmetric
} = require('../utilities/crypto');
const {
	getCredentials
} = require('../utilities/auth');
const {
	workspaceMemberPublicKeys,
	uploadFile
} = require('../api');
const {
	KEYS_HOST
} = require('../variables');

/**
 * Find, encrypt, and send .env file and keys
 * [Elaborate more on mechanism]
*/
const push = async () => {
		
	try {
		const credentials = getCredentials({
			host: KEYS_HOST
		});

		const file = read(".env"); // read .env
		const workspaceId = read(".env.infisical");
		
		const randomBytes = crypto.randomBytes(16).toString('hex'); // generate symmetic key bytes
		
		const {
			ciphertext,
			iv,
			tag
		} = encryptSymmetric({
			plaintext: file,
			key: randomBytes
		});
		
		// get all recipients public keys
		const publicKeys = await workspaceMemberPublicKeys({
			workspaceId
		});
		
		// assymmetrically encrypt key with all workspace members'
		// public keys
		const keys = publicKeys.map(k => {
			const { ciphertext, nonce } = encryptAssymmetric({
				plaintext: randomBytes,
				publicKey: k.publicKey,
				privateKey: credentials.password
			});
			
			return ({
				encryptedKey: ciphertext,
				nonce,
				userId: k.userId
			});
		});
		
		// package payload
		const payload = ({
			workspaceId,
			ciphertext, 
			iv,
			tag,
			keys
		});

		// send payload
		await uploadFile(payload);
		
	} catch (err) {
		console.log('Failed to push .env file');
		process.exit(1);
	}
	
	console.log('Successfully uploaded .env file');
	process.exit(0);
}

module.exports = push;
