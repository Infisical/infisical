import { MongoAbility } from "@casl/ability";

import { INFISICAL_SECRET_VALUE_HIDDEN_MASK } from "@app/services/secret/secret-fns";

import { hasSecretReadValueOrDescribePermission } from "../permission/permission-fns";
import { ProjectPermissionSecretActions, ProjectPermissionSet } from "../permission/project-permission";
import { TSecretApprovalBridgeCommit } from "./secret-approval-request-merge-fns";

export type TSecretApprovalCommitValueAccess = (tags: { slug: string }[]) => boolean;

type TSecretApprovalCommitMetadata = { key: string; value?: string | null; encryptedValue?: string | null };

// Reviewers get temporary read access only while the request is open for review. Everyone else is
// bound by their own secret read permissions on the request's environment, path and tags.
export const buildSecretApprovalCommitValueAccess =
  ({
    permission,
    isReviewer,
    isRequestOpen,
    environment,
    secretPath
  }: {
    permission: MongoAbility<ProjectPermissionSet>;
    isReviewer: boolean;
    isRequestOpen: boolean;
    environment: string;
    secretPath?: string | null;
  }): TSecretApprovalCommitValueAccess =>
  (tags) =>
    (isReviewer && isRequestOpen) ||
    hasSecretReadValueOrDescribePermission(permission, ProjectPermissionSecretActions.ReadValue, {
      environment,
      secretPath: secretPath || "/",
      secretTags: tags.map((tag) => tag.slug)
    });

export const formatSecretApprovalCommitsV2Bridge = ({
  commits,
  decryptor,
  canReadSecretValue
}: {
  commits: TSecretApprovalBridgeCommit[];
  decryptor: (arg: { cipherTextBlob: Buffer }) => Buffer;
  canReadSecretValue: TSecretApprovalCommitValueAccess;
}) =>
  commits.map((el) => {
    const secretValueHidden = !canReadSecretValue(el.tags);
    const decryptValue = (encryptedValue?: Buffer | null) =>
      encryptedValue ? decryptor({ cipherTextBlob: encryptedValue }).toString() : "";
    const commitSecretValue = () => {
      if (secretValueHidden) return INFISICAL_SECRET_VALUE_HIDDEN_MASK;
      if (el.secret?.isRotatedSecret) return undefined;
      return el.encryptedValue !== undefined && el.encryptedValue !== null
        ? decryptor({ cipherTextBlob: el.encryptedValue }).toString()
        : undefined;
    };

    return {
      ...el,
      secretKey: el.key,
      id: el.id,
      version: el.version,
      secretMetadata: (Array.isArray(el.secretMetadata)
        ? (el.secretMetadata as TSecretApprovalCommitMetadata[])
        : []
      ).map((meta) => ({
        key: meta.key,
        isEncrypted: Boolean(meta.encryptedValue),
        value: meta.encryptedValue
          ? decryptor({ cipherTextBlob: Buffer.from(meta.encryptedValue, "base64") }).toString()
          : meta.value || ""
      })),
      isRotatedSecret: el.secret?.isRotatedSecret ?? false,
      secretValueHidden,
      secretValue: commitSecretValue(),
      secretComment:
        el.encryptedComment !== undefined && el.encryptedComment !== null
          ? decryptor({ cipherTextBlob: el.encryptedComment }).toString()
          : undefined,
      skipMultilineEncoding:
        el.skipMultilineEncoding !== undefined && el.skipMultilineEncoding !== null
          ? el.skipMultilineEncoding
          : undefined,
      secret: el.secret
        ? {
            secretKey: el.secret.key,
            id: el.secret.id,
            version: el.secret.version,
            secretValueHidden,
            secretValue: secretValueHidden
              ? INFISICAL_SECRET_VALUE_HIDDEN_MASK
              : decryptValue(el.secret.encryptedValue),
            secretComment: decryptValue(el.secret.encryptedComment)
          }
        : undefined,
      secretVersion: el.secretVersion
        ? {
            secretKey: el.secretVersion.key,
            id: el.secretVersion.id,
            version: el.secretVersion.version,
            secretValueHidden,
            secretValue: secretValueHidden
              ? INFISICAL_SECRET_VALUE_HIDDEN_MASK
              : decryptValue(el.secretVersion.encryptedValue),
            secretComment: decryptValue(el.secretVersion.encryptedComment),
            tags: el.secretVersion.tags,
            // The live secret's metadata is stored as raw ciphertext while the commit's proposed metadata is
            // base64 encoded, so the two decode differently.
            secretMetadata: el.oldSecretMetadata?.map((meta) => ({
              key: meta.key,
              isEncrypted: Boolean(meta.encryptedValue),
              value: meta.encryptedValue
                ? decryptor({ cipherTextBlob: Buffer.from(meta.encryptedValue) }).toString()
                : meta.value || ""
            })),
            skipMultilineEncoding: el.secretVersion.skipMultilineEncoding
          }
        : undefined
    };
  });

export type TFormattedSecretApprovalCommitV2Bridge = ReturnType<typeof formatSecretApprovalCommitsV2Bridge>[number];
