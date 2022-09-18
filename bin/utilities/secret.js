const { decryptAsymmetric, decryptSymmetric } = require("./crypto");

/**
 * Return decrypted secrets in format [format]
 * @param {Object} obj
 * @param {Object[]} obj.secrets - array of (encrypted) secret key-value pair objects
 * @param {String} obj.key - symmetric key to decrypt secret key-value pairs
 * @param {String} obj.format - desired return format that is either "text," "object," or "expanded"
 * @return {String|Object} (decrypted) secrets also called the content
 */
const decryptSecrets = ({ secrets, key, format }) => {
	// init content
	let content = format === "text" ? "" : {};

	// decrypt secrets
	secrets.secrets.forEach((sp, idx) => {
		
		const secretKey = decryptSymmetric({
			ciphertext: sp.secretKey.ciphertext,
			iv: sp.secretKey.iv,
			tag: sp.secretKey.tag,
			key,
		});

		const secretValue = decryptSymmetric({
			ciphertext: sp.secretValue.ciphertext,
			iv: sp.secretValue.iv,
			tag: sp.secretValue.tag,
			key,
		});

		switch (format) {
			case "text":
				content += secretKey;
				content += "=";
				content += secretValue;

				if (idx < secrets.secrets.length) {
					content += "\n";
				}
				break;
			case "object":
				content[secretKey] = secretValue;
				break;
			case "expanded":
				content[secretKey] = ({
					...sp,
					plaintextKey: secretKey,
					plaintextValue: secretValue
				});
				break;
		}
	});

	return content;
};

module.exports = {
	decryptSecrets,
};
