/* eslint-disable no-await-in-loop */
import path from "path";

import { SecretKeyEncoding, TSecretBlindIndexes, TSecrets } from "@app/db/schemas";
import { getConfig } from "@app/lib/config/env";
import { buildSecretBlindIndexFromName, decryptSymmetric128BitHexKeyUTF8 } from "@app/lib/crypto";

import { TSecretFolderDalFactory } from "../secret-folder/secret-folder-dal";
import { TSecretDalFactory } from "./secret-dal";

export const generateSecretBlindIndexBySalt = async (
  secretName: string,
  secretBlindIndexDoc: TSecretBlindIndexes
) => {
  const appCfg = getConfig();
  const secretBlindIndex = await buildSecretBlindIndexFromName({
    secretName,
    keyEncoding: secretBlindIndexDoc.keyEncoding as SecretKeyEncoding,
    rootEncryptionKey: appCfg.ROOT_ENCRYPTION_KEY,
    encryptionKey: appCfg.ENCRYPTION_KEY,
    tag: secretBlindIndexDoc.saltTag,
    ciphertext: secretBlindIndexDoc.encryptedSaltCipherText,
    iv: secretBlindIndexDoc.saltIV
  });
  return secretBlindIndex;
};

type TInterpolateSecretArg = {
  projectId: string;
  secretEncKey: string;
  secretDal: Pick<TSecretDalFactory, "findByFolderId">;
  folderDal: Pick<TSecretFolderDalFactory, "findBySecretPath">;
};

export const interpolateSecrets = ({
  projectId,
  secretEncKey,
  secretDal,
  folderDal
}: TInterpolateSecretArg) => {
  const fetchSecretsCrossEnv = () => {
    const fetchCache: Record<string, Record<string, string>> = {};

    return async (secRefEnv: string, secRefPath: string[], secRefKey: string) => {
      const secRefPathUrl = path.join("/", ...secRefPath);
      const uniqKey = `${secRefEnv}-${secRefPathUrl}`;

      if (fetchCache?.[uniqKey]) {
        return fetchCache[uniqKey][secRefKey];
      }

      const folder = await folderDal.findBySecretPath(projectId, secRefEnv, secRefPathUrl);
      if (!folder) return "";
      const secrets = await secretDal.findByFolderId(folder.id);

      const decryptedSec = secrets.reduce<Record<string, string>>((prev, secret) => {
        const secretKey = decryptSymmetric128BitHexKeyUTF8({
          ciphertext: secret.secretKeyCiphertext,
          iv: secret.secretKeyIV,
          tag: secret.secretKeyTag,
          key: secretEncKey
        });
        const secretValue = decryptSymmetric128BitHexKeyUTF8({
          ciphertext: secret.secretValueCiphertext,
          iv: secret.secretValueIV,
          tag: secret.secretValueTag,
          key: secretEncKey
        });

        // eslint-disable-next-line
        prev[secretKey] = secretValue;
        return prev;
      }, {});

      fetchCache[uniqKey] = decryptedSec;

      return fetchCache[uniqKey][secRefKey];
    };
  };

  const INTERPOLATION_SYNTAX_REG = /\${([^}]+)}/g;
  const recursivelyExpandSecret = async (
    expandedSec: Record<string, string>,
    interpolatedSec: Record<string, string>,
    fetchCrossEnv: (env: string, secPath: string[], secKey: string) => Promise<string>,
    recursionChainBreaker: Record<string, boolean>,
    key: string
  ) => {
    if (expandedSec?.[key] !== undefined) {
      return expandedSec[key];
    }
    if (recursionChainBreaker?.[key]) {
      return "";
    }
    // eslint-disable-next-line
    recursionChainBreaker[key] = true;

    let interpolatedValue = interpolatedSec[key];
    if (!interpolatedValue) {
      // eslint-disable-next-line no-console
      console.error(`Couldn't find referenced value - ${key}`);
      return "";
    }

    const refs = interpolatedValue.match(INTERPOLATION_SYNTAX_REG);
    if (refs) {
      for (const interpolationSyntax of refs) {
        const interpolationKey = interpolationSyntax.slice(2, interpolationSyntax.length - 1);
        const entities = interpolationKey.trim().split(".");

        if (entities.length === 1) {
          const val = await recursivelyExpandSecret(
            expandedSec,
            interpolatedSec,
            fetchCrossEnv,
            recursionChainBreaker,
            interpolationKey
          );
          if (val) {
            interpolatedValue = interpolatedValue.replaceAll(interpolationSyntax, val);
          }
          // eslint-disable-next-line
          continue;
        }

        if (entities.length > 1) {
          const secRefEnv = entities[0];
          const secRefPath = entities.slice(1, entities.length - 1);
          const secRefKey = entities[entities.length - 1];

          const val = await fetchCrossEnv(secRefEnv, secRefPath, secRefKey);
          if (val) {
            interpolatedValue = interpolatedValue.replaceAll(interpolationSyntax, val);
          }
        }
      }
    }

    // eslint-disable-next-line
    expandedSec[key] = interpolatedValue;
    return interpolatedValue;
  };

  // used to convert multi line ones to quotes ones with \n
  const formatMultiValueEnv = (val?: string) => {
    if (!val) return "";
    if (!val.match("\n")) return val;
    return `"${val.replace(/\n/g, "\\n")}"`;
  };

  const expandSecrets = async (
    secrets: Record<string, { value: string; comment?: string; skipMultilineEncoding?: boolean }>
  ) => {
    const expandedSec: Record<string, string> = {};
    const interpolatedSec: Record<string, string> = {};

    const crossSecEnvFetch = fetchSecretsCrossEnv();

    Object.keys(secrets).forEach((key) => {
      if (secrets[key].value.match(INTERPOLATION_SYNTAX_REG)) {
        interpolatedSec[key] = secrets[key].value;
      } else {
        expandedSec[key] = secrets[key].value;
      }
    });

    for (const key of Object.keys(secrets)) {
      if (expandedSec?.[key]) {
        // should not do multi line encoding if user has set it to skip
        // eslint-disable-next-line
        secrets[key].value = secrets[key].skipMultilineEncoding
          ? expandedSec[key]
          : formatMultiValueEnv(expandedSec[key]);
        // eslint-disable-next-line
        continue;
      }

      // this is to avoid recursion loop. So the graph should be direct graph rather than cyclic
      // so for any recursion building if there is an entity two times same key meaning it will be looped
      const recursionChainBreaker: Record<string, boolean> = {};
      const expandedVal = await recursivelyExpandSecret(
        expandedSec,
        interpolatedSec,
        crossSecEnvFetch,
        recursionChainBreaker,
        key
      );

      // eslint-disable-next-line
      secrets[key].value = secrets[key].skipMultilineEncoding
        ? expandedVal
        : formatMultiValueEnv(expandedVal);
    }

    return secrets;
  };
  return expandSecrets;
};

export const decryptSecretRaw = (secret: TSecrets, key: string) => {
  const secretKey = decryptSymmetric128BitHexKeyUTF8({
    ciphertext: secret.secretKeyCiphertext,
    iv: secret.secretKeyIV,
    tag: secret.secretKeyTag,
    key
  });

  const secretValue = decryptSymmetric128BitHexKeyUTF8({
    ciphertext: secret.secretValueCiphertext,
    iv: secret.secretValueIV,
    tag: secret.secretValueTag,
    key
  });

  let secretComment = "";

  if (secret.secretCommentCiphertext && secret.secretCommentIV && secret.secretCommentTag) {
    secretComment = decryptSymmetric128BitHexKeyUTF8({
      ciphertext: secret.secretCommentCiphertext,
      iv: secret.secretCommentIV,
      tag: secret.secretCommentTag,
      key
    });
  }

  return {
    secretKey,
    secretValue,
    secretComment,
    version: secret.version,
    type: secret.type,
    _id: secret.id,
    id: secret.id,
    user: secret.userId
  };
};
