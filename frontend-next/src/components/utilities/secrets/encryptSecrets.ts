import { SecretDataProps } from "public/data/frequentInterfaces";
/**
 * Encypt secrets before pushing the to the DB
 * @param {object} obj
 * @param {object} obj.secretsToEncrypt - secrets that we want to encrypt
 * @param {object} obj.workspaceId - the id of a project in which we are encrypting secrets
 * @returns
 */
const encryptSecrets = async ({
  secretsToEncrypt,
  env
}: {
  secretsToEncrypt: SecretDataProps[];
  workspaceId: string;
  env: string;
}) => {
  let secrets;
  try {
    secrets = secretsToEncrypt.map((secret) => {
      const result = {
        id: secret.id,
        createdAt: "",
        environment: env,
        secretKey: secret.key,
        secretValue: secret.value,
        secretComment: secret.comment,
        tags: secret.tags
      };

      return result;
    });
  } catch (error) {
    console.log("Error while encrypting secrets");
  }

  return secrets;
};

export default encryptSecrets;
