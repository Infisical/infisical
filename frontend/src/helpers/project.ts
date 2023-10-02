import crypto from "crypto";

import { encryptAssymmetric } from "@app/components/utilities/cryptography/crypto";
import encryptSecrets from "@app/components/utilities/secrets/encryptSecrets";
import { uploadWsKey } from "@app/hooks/api/keys/queries";
import { createSecret } from "@app/hooks/api/secrets/mutations";
import { fetchUserDetails } from "@app/hooks/api/users/queries";
import { createWorkspace } from "@app/hooks/api/workspace/queries";

const secretsToBeAdded = [
  {
    pos: 0,
    key: "DATABASE_URL",
    // eslint-disable-next-line no-template-curly-in-string
    value: "mongodb+srv://${DB_USERNAME}:${DB_PASSWORD}@mongodb.net",
    valueOverride: undefined,
    comment: "Secret referencing example",
    id: "",
    tags: []
  },
  {
    pos: 1,
    key: "DB_USERNAME",
    value: "OVERRIDE_THIS",
    valueOverride: undefined,
    comment: "Override secrets with personal value",
    id: "",
    tags: []
  },
  {
    pos: 2,
    key: "DB_PASSWORD",
    value: "OVERRIDE_THIS",
    valueOverride: undefined,
    comment: "Another secret override",
    id: "",
    tags: []
  },
  {
    pos: 3,
    key: "DB_USERNAME",
    value: "user1234",
    valueOverride: "user1234",
    comment: "",
    id: "",
    tags: []
  },
  {
    pos: 4,
    key: "DB_PASSWORD",
    value: "example_password",
    valueOverride: "example_password",
    comment: "",
    id: "",
    tags: []
  },
  {
    pos: 5,
    key: "TWILIO_AUTH_TOKEN",
    value: "example_twillio_token",
    valueOverride: undefined,
    comment: "",
    id: "",
    tags: []
  },
  {
    pos: 6,
    key: "WEBSITE_URL",
    value: "http://localhost:3000",
    valueOverride: undefined,
    comment: "",
    id: "",
    tags: []
  }
];

/**
 * Create and initialize a new project in organization with id [organizationId]
 * Note: current user should be a member of the organization
 * @param {Object} obj
 * @param {String} obj.organizationId - id of organization
 * @param {String} obj.projectName - name of new project
 * @returns {Project} project - new project
 */
const initProjectHelper = async ({
  organizationId,
  projectName
}: {
  organizationId: string;
  projectName: string;
}) => {
  // create new project
  const {
    data: { workspace }
  } = await createWorkspace({
    workspaceName: projectName,
    organizationId
  });

  // create and upload new (encrypted) project key
  const randomBytes = crypto.randomBytes(16).toString("hex");
  const PRIVATE_KEY = localStorage.getItem("PRIVATE_KEY");

  if (!PRIVATE_KEY) throw new Error("Failed to find private key");

  const user = await fetchUserDetails();

  const { ciphertext, nonce } = encryptAssymmetric({
    plaintext: randomBytes,
    publicKey: user.publicKey,
    privateKey: PRIVATE_KEY
  });

  await uploadWsKey({
    workspaceId: workspace._id,
    userId: user._id,
    encryptedKey: ciphertext,
    nonce
  });

  // encrypt and upload secrets to new project
  const secrets = await encryptSecrets({
    secretsToEncrypt: secretsToBeAdded,
    workspaceId: workspace._id,
    env: "dev"
  });

  secrets?.forEach((secret) => {
    createSecret({
      workspaceId: workspace._id,
      environment: secret.environment,
      type: secret.type,
      secretKey: secret.secretName,
      secretKeyCiphertext: secret.secretKeyCiphertext,
      secretKeyIV: secret.secretKeyIV,
      secretKeyTag: secret.secretKeyTag,
      secretValueCiphertext: secret.secretValueCiphertext,
      secretValueIV: secret.secretValueIV,
      secretValueTag: secret.secretValueTag,
      secretCommentCiphertext: secret.secretCommentCiphertext,
      secretCommentIV: secret.secretCommentIV,
      secretCommentTag: secret.secretCommentTag,
      secretPath: "/",
      metadata: {
        source: "signup"
      }
    });
  });

  return workspace;
};

export { initProjectHelper };
