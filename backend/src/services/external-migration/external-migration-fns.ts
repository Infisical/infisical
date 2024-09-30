import { randomUUID } from "crypto";
import sjcl from "sjcl";
import tweetnacl from "tweetnacl";
import tweetnaclUtil from "tweetnacl-util";

import { BadRequestError } from "@app/lib/errors";

import { InfisicalImportData, TEnvKeyExportJSON } from "./external-migration-types";

const { codec, hash } = sjcl;
const { secretbox } = tweetnacl;

export const decryptEnvKeyData = async (decryptionKey: string, encryptedJson: { nonce: string; data: string }) => {
  const key = tweetnaclUtil.decodeBase64(codec.base64.fromBits(hash.sha256.hash(decryptionKey)));
  const nonce = tweetnaclUtil.decodeBase64(encryptedJson.nonce);
  const encryptedData = tweetnaclUtil.decodeBase64(encryptedJson.data);

  const decrypted = secretbox.open(encryptedData, nonce, key);

  if (!decrypted) {
    throw new BadRequestError({ message: "Decryption failed, please check the entered encryption key" });
  }

  const decryptedJson = tweetnaclUtil.encodeUTF8(decrypted);
  return decryptedJson;
};

export const parseEnvKeyData = async (decryptedJson: string): Promise<InfisicalImportData> => {
  const parsedJson: TEnvKeyExportJSON = JSON.parse(decryptedJson) as TEnvKeyExportJSON;

  const infisicalImportData: InfisicalImportData = {
    projects: new Map<string, { name: string; id: string }>(),
    environments: new Map<string, { name: string; id: string; projectId: string }>(),
    secrets: new Map<string, { name: string; id: string; projectId: string; environmentId: string; value: string }>()
  };

  parsedJson.apps.forEach((app: { name: string; id: string }) => {
    infisicalImportData.projects.set(app.id, { name: app.name, id: app.id });
  });

  // string to string map for env templates
  const envTemplates = new Map<string, string>();
  for (const env of parsedJson.defaultEnvironmentRoles) {
    envTemplates.set(env.id, env.defaultName);
  }

  // environments
  for (const env of parsedJson.baseEnvironments) {
    infisicalImportData.environments?.set(env.id, {
      id: env.id,
      name: envTemplates.get(env.environmentRoleId)!,
      projectId: env.envParentId
    });
  }

  // secrets
  for (const env of Object.keys(parsedJson.envs)) {
    if (!env.includes("|")) {
      const envData = parsedJson.envs[env];
      for (const secret of Object.keys(envData.variables)) {
        const id = randomUUID();
        infisicalImportData.secrets?.set(id, {
          id,
          name: secret,
          environmentId: env,
          value: envData.variables[secret].val
        });
      }
    }
  }

  return infisicalImportData;
};
