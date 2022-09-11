const {
  decryptAsymmetric,
  decryptSymmetric
} = require("./crypto");

/**
 * Return decrypted secrets in format [format]
 * @param {Object} obj
 * @param {Object[]} obj.secrets - array of (encrypted) secret key-value pair objects
 * @param {String} obj.key - symmetric key to decrypt secret key-value pairs
 * @param {String} obj.format - either "text" or "object"
 * @return {String|Object} (decrypted) secrets also called the content
*/
const decryptSecrets = ({
  secrets,
	key,
  format
}) => {
	
	// init content
	let content;
	switch (format) {
		case "text":
			content = "";
			break;
		case "object":
			content = {};
			break;
		default:
			console.error("❌ Error: Invalid return format for decrypting secrets");
			process.exit(0);
			break;
	}
	
	// decrypt secrets
	secrets.secrets.forEach((sp, idx) => {
		const secretKey = decryptSymmetric({
			ciphertext: sp.secretKey.ciphertext,
			iv: sp.secretKey.iv,
			tag: sp.secretKey.tag,
			key
		});

		const secretValue = decryptSymmetric({
			ciphertext: sp.secretValue.ciphertext,
			iv: sp.secretValue.iv,
			tag: sp.secretValue.tag,
			key
		});
		
		if (format === "text") {
			content += secretKey;
			content += '=';
			content += secretValue;
			
			if (idx < secrets.secrets.length) {
				content += '\n';
			}
		} else {
			content[secretKey] = secretValue
		}
	});
	
	return content;
}

module.exports = {
  decryptSecrets
}
