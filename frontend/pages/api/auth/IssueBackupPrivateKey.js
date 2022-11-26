import SecurityClient from "~/utilities/SecurityClient";
import { PATH } from "../../../const";

/**
 * This is the route that issues a backup private key that will afterwards be added into a pdf
 */
const issueBackupPrivateKey = ({
	encryptedPrivateKey,
	iv,
	tag,
	salt,
	verifier,
	clientProof,
}) => {
	return SecurityClient.fetchCall(
		PATH + "/api/v1/password/backup-private-key",
		{
			method: "POST",
			headers: {
				"Content-Type": "application/json",
			},
			body: JSON.stringify({
				clientProof: clientProof,
				encryptedPrivateKey: encryptedPrivateKey,
				iv: iv,
				tag: tag,
				salt: salt,
				verifier: verifier,
			}),
		}
	).then((res) => {
		if (res.status == 200) {
			return res;
		} else {
			return res;
			console.log("Failed to issue the backup key");
		}
	});
};

export default issueBackupPrivateKey;
