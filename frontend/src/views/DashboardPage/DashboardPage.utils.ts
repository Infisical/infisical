/* eslint-disable @typescript-eslint/naming-convention */
import crypto from "crypto";

import * as yup from "yup";

import {
  decryptAssymmetric,
  encryptSymmetric
} from "@app/components/utilities/cryptography/crypto";
import { BatchSecretDTO, DecryptedSecret } from "@app/hooks/api/secrets/types";

export enum SecretActionType {
  Created = "created",
  Modified = "modified",
  Deleted = "deleted"
}

export const DEFAULT_SECRET_VALUE = {
  _id: undefined,
  overrideAction: undefined,
  idOverride: undefined,
  valueOverride: undefined,
  comment: "",
  key: "",
  value: "",
  tags: []
};

const secretSchema = yup.object({
  _id: yup.string(),
  key: yup
    .string()
    .trim()
    .required()
    .label("Secret key")
    .test("starts-with-number", "Should start with an alphabet", (val) =>
      Boolean(val?.charAt(0)?.match(/[a-zA-Z]/i))
    )
    .test({
      name: "duplicate-keys",
      // TODO:(akhilmhdh) ts keeps throwing from not found need to see how to resolve this
      test: (val, ctx: any) => {
        const secrets: Array<{ key: string }> = ctx?.from?.[1]?.value?.secrets || [];
        const duplicateKeys: Record<number, boolean> = {};
        secrets?.forEach(({ key }, index) => {
          if (key === val) duplicateKeys[index + 1] = true;
        });
        const pos = Object.keys(duplicateKeys);
        if (pos.length <= 1) {
          return true;
        }
        return ctx.createError({ message: `Same key in row ${pos.join(", ")}` });
      }
    }),
  value: yup.string().trim(),
  comment: yup.string().trim(),
  tags: yup.array(
    yup.object({
      _id: yup.string().required(),
      name: yup.string().required(),
      slug: yup.string().required()
    })
  ),
  overrideAction: yup.string().notRequired().oneOf(Object.values(SecretActionType)),
  idOverride: yup.string().notRequired(),
  valueOverride: yup.string().trim().notRequired()
});

export const schema = yup.object({
  isSnapshotMode: yup.bool().notRequired(),
  secrets: yup.array(secretSchema)
});

export type FormData = yup.InferType<typeof schema>;
export type TSecretDetailsOpen = { index: number; id: string };
export type TSecOverwriteOpt = { secrets: Record<string, { comments: string[]; value: string }> };

export const downloadSecret = (
  secrets: FormData["secrets"] = [],
  importedSecrets: { key: string; value?: string; comment?: string }[] = [],
  env: string = "unknown"
) => {
  const importSecPos: Record<string, number> = {};
  importedSecrets.forEach((el, index) => {
    importSecPos[el.key] = index;
  });
  const finalSecret = [...importedSecrets];
  secrets.forEach(({ key, value, valueOverride, overrideAction, comment }) => {
    const newValue = {
      key,
      value: overrideAction && overrideAction !== SecretActionType.Deleted ? valueOverride : value,
      comment
    };
    // can also be zero thus failing
    if (typeof importSecPos?.[key] === "undefined") {
      finalSecret.push(newValue);
    } else {
      finalSecret[importSecPos[key]] = newValue;
    }
  });

  let file = "";
  finalSecret.forEach(({ key, value, comment }) => {
    if (comment) {
      file += `# ${comment}\n${key}=${value}\n`;
      return;
    }
    file += `${key}=${value}\n`;
  });

  const blob = new Blob([file]);
  const fileDownloadUrl = URL.createObjectURL(blob);
  const alink = document.createElement("a");
  alink.href = fileDownloadUrl;
  alink.download = `${env}.env`;
  alink.click();
};

/*
 * Below functions are used convert the dashboard secrets to the bulk secret creation request format
 * They are encrypted back
 * Formatted to [ { request: "", secret:{} } ]
 */
const encryptASecret = (randomBytes: string, key: string, value?: string, comment?: string) => {
  // encrypt key
  const {
    ciphertext: secretKeyCiphertext,
    iv: secretKeyIV,
    tag: secretKeyTag
  } = encryptSymmetric({
    plaintext: key,
    key: randomBytes
  });

  // encrypt value
  const {
    ciphertext: secretValueCiphertext,
    iv: secretValueIV,
    tag: secretValueTag
  } = encryptSymmetric({
    plaintext: value ?? "",
    key: randomBytes
  });

  // encrypt comment
  const {
    ciphertext: secretCommentCiphertext,
    iv: secretCommentIV,
    tag: secretCommentTag
  } = encryptSymmetric({
    plaintext: comment ?? "",
    key: randomBytes
  });

  return {
    secretKeyCiphertext,
    secretKeyIV,
    secretKeyTag,
    secretValueCiphertext,
    secretValueIV,
    secretValueTag,
    secretCommentCiphertext,
    secretCommentIV,
    secretCommentTag
  };
};

const deepCompareSecrets = (lhs: DecryptedSecret, rhs: any) =>
  lhs.key === rhs.key &&
  lhs.value === rhs.value &&
  lhs.comment === rhs.comment &&
  lhs?.valueOverride === rhs?.valueOverride &&
  JSON.stringify(lhs.tags) === JSON.stringify(rhs.tags);

export const transformSecretsToBatchSecretReq = (
  deletedSecretIds: string[],
  latestFileKey: any,
  secrets: FormData["secrets"],
  intialValues: DecryptedSecret[] = []
) => {
  // deleted secrets
  const secretsToBeDeleted: BatchSecretDTO["requests"] = deletedSecretIds.map((id) => ({
    method: "DELETE",
    secret: { _id: id }
  }));

  const secretsToBeUpdated: BatchSecretDTO["requests"] = [];
  const secretsToBeCreated: BatchSecretDTO["requests"] = [];
  const PRIVATE_KEY = localStorage.getItem("PRIVATE_KEY") as string;

  const randomBytes = latestFileKey
    ? decryptAssymmetric({
        ciphertext: latestFileKey.encryptedKey,
        nonce: latestFileKey.nonce,
        publicKey: latestFileKey.sender.publicKey,
        privateKey: PRIVATE_KEY
      })
    : crypto.randomBytes(16).toString("hex");

  secrets?.forEach((secret) => {
    const {
      _id,
      idOverride,
      value,
      valueOverride,
      overrideAction,
      tags = [],
      comment,
      key
    } = secret;
    if (!idOverride && overrideAction === SecretActionType.Created) {
      secretsToBeCreated.push({
        method: "POST",
        secret: {
          type: "personal",
          tags,
          secretName: key,
          ...encryptASecret(randomBytes, key, valueOverride, comment)
        }
      });
    }
    // to be created ones as they don't have server generated id
    if (!_id) {
      secretsToBeCreated.push({
        method: "POST",
        secret: {
          type: "shared",
          tags,
          secretName: key,
          ...encryptASecret(randomBytes, key, value, comment)
        }
      });
      return; // exit as updated and delete case won't happen when created
    }
    // has an id means this is updated one
    if (_id) {
      // check value has changed or not
      const initialSecretValue = intialValues?.find(({ _id: secId }) => secId === _id)!;
      if (!deepCompareSecrets(initialSecretValue, secret)) {
        secretsToBeUpdated.push({
          method: "PATCH",
          secret: {
            _id,
            type: "shared",
            tags,
            secretName: key,
            ...encryptASecret(randomBytes, key, value, comment)
          }
        });
      }
    }
    if (idOverride) {
      // if action is deleted meaning override has been removed but id is kept to collect at this point
      if (overrideAction === SecretActionType.Deleted) {
        secretsToBeDeleted.push({ method: "DELETE", secret: { _id: idOverride } });
      } else {
        // if not deleted action then as id is there its an updated
        const initialSecretValue = intialValues?.find(({ _id: secId }) => secId === _id)!;
        if (!deepCompareSecrets(initialSecretValue, secret)) {
          secretsToBeUpdated.push({
            method: "PATCH",
            secret: {
              _id: idOverride,
              type: "personal",
              tags,
              secretName: key,
              ...encryptASecret(randomBytes, key, valueOverride, comment)
            }
          });
        }
      }
    }
  });

  return secretsToBeCreated.concat(secretsToBeUpdated, secretsToBeDeleted);
};
