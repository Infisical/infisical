import Aes256Gcm from "../aes-256-gcm";
import SRP1 from "../../pages/api/auth/SRP1";
import issueBackupPrivateKey from "../../pages/api/auth/IssueBackupPrivateKey";
import generateBackupPDF from "./generateBackupPDF";

const nacl = require("tweetnacl");
nacl.util = require("tweetnacl-util");
const jsrp = require("jsrp");
const clientPassword = new jsrp.client();
const clientKey = new jsrp.client();
const crypto = require("crypto");

/**
 * This function loggs in the user (whether it's right after signup, or a normal login)
 * @param {*} email
 * @param {*} password
 * @param {*} setErrorLogin
 * @param {*} router
 * @param {*} isSignUp
 * @returns
 */
const issueBackupKey = async ({
	email,
	password,
	personalName,
	setBackupKeyError,
	setBackupKeyIssued
}) => {
	try {
		setBackupKeyError(false);
		setBackupKeyIssued(false);
		clientPassword.init(
			{
				username: email,
				password: password,
			},
			async () => {
				const clientPublicKey = clientPassword.getPublicKey();

				let serverPublicKey, salt;
				try {
					const res = await SRP1({
						clientPublicKey: clientPublicKey
					});
					serverPublicKey = res.serverPublicKey;
					salt = res.salt;
				} catch (err) {
					setBackupKeyError(true);
					console.log("Wrong current password", err, 1);
				}

				clientPassword.setSalt(salt);
				clientPassword.setServerPublicKey(serverPublicKey);
				const clientProof = clientPassword.getProof(); // called M1

				const generatedKey = crypto.randomBytes(16).toString("hex");

				clientKey.init({
					username: email,
					password: generatedKey
				}, async () => {
					clientKey.createVerifier(async (err, result) => {


						let { ciphertext, iv, tag } = Aes256Gcm.encrypt(
							localStorage.getItem("PRIVATE_KEY"), 
							generatedKey
						);

						const res = await issueBackupPrivateKey({
							encryptedPrivateKey: ciphertext,
							iv,
							tag,
							salt: result.salt,
							verifier: result.verifier,
							clientProof
						});

						if (res.status == 400) {
							setBackupKeyError(true);
						} else if (res.status == 200) {
							generateBackupPDF(personalName, email, generatedKey);
							setBackupKeyIssued(true);
						}
					});
				})
			}
		);
	} catch (error) {
		setBackupKeyError(true);
		console.log("Failed to issue a backup key");
	}
	return true;
};

export default issueBackupKey;
