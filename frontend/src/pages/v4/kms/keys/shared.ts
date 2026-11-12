import { useParams } from "@tanstack/react-router";

import {
  ProjectPermissionCmekActions,
  ProjectPermissionSub
} from "@app/context/ProjectPermissionContext/types";
import {
  AsymmetricKeyAlgorithm,
  KmsKeyUsage,
  type TCmek,
  type TCmekBulkExportedKey
} from "@app/hooks/api/cmeks/types";

import { useProjectPermission } from "../../access/permissions";

export const RESTRICTED = "You don't have permission to do this";

export const usageLabel: Record<KmsKeyUsage, string> = {
  [KmsKeyUsage.ENCRYPT_DECRYPT]: "Encrypt and decrypt",
  [KmsKeyUsage.SIGN_VERIFY]: "Sign and verify",
  [KmsKeyUsage.GENERATE_VERIFY_MAC]: "Generate and verify MAC"
};

export const algorithmLabel = (algorithm: string) => algorithm.replaceAll("_", "-").toUpperCase();

export const isAsymmetricKey = (key: TCmek) =>
  (Object.values(AsymmetricKeyAlgorithm) as string[]).includes(key.algorithm);

const BASE64 = /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=|[A-Za-z0-9+/]{4})$/;
export const isBase64 = (value: string) =>
  value.length > 0 && value.length % 4 === 0 && BASE64.test(value);

export const base64ByteLength = (value: string) => {
  if (!isBase64(value)) return null;
  const padding = value.endsWith("==") ? 2 : Number(value.endsWith("="));
  return (value.length * 3) / 4 - padding;
};

export const decodeBase64Text = (value: string) => Buffer.from(value, "base64").toString("utf8");

export const useKmsProjectId = () =>
  useParams({ from: "/v4/organizations/$orgId/projects/kms/$projectId/overview" });

export const useKeyPermissions = (projectId: string) => {
  const { permission, isPending } = useProjectPermission(projectId);
  const can = (action: ProjectPermissionCmekActions) =>
    permission.can(action, ProjectPermissionSub.Cmek);
  return {
    isPending,
    read: can(ProjectPermissionCmekActions.Read),
    create: can(ProjectPermissionCmekActions.Create),
    edit: can(ProjectPermissionCmekActions.Edit),
    remove: can(ProjectPermissionCmekActions.Delete),
    encrypt: can(ProjectPermissionCmekActions.Encrypt),
    decrypt: can(ProjectPermissionCmekActions.Decrypt),
    sign: can(ProjectPermissionCmekActions.Sign),
    verify: can(ProjectPermissionCmekActions.Verify),
    generateMac: can(ProjectPermissionCmekActions.GenerateMac),
    verifyMac: can(ProjectPermissionCmekActions.VerifyMac),
    rotate: can(ProjectPermissionCmekActions.Rotate),
    exportPrivateKey: can(ProjectPermissionCmekActions.ExportPrivateKey)
  };
};

export type KeyPermissions = ReturnType<typeof useKeyPermissions>;

export const keysToExportJson = (keys: TCmekBulkExportedKey[]) =>
  keys.map((key) => {
    if (key.keyUsage === KmsKeyUsage.SIGN_VERIFY)
      return {
        name: key.name,
        keyType: key.keyUsage,
        algorithm: key.algorithm,
        privateKey: key.privateKey,
        publicKey: key.publicKey ?? ""
      };
    return {
      name: key.name,
      keyType: key.keyUsage,
      algorithm: key.algorithm,
      keyMaterial: key.privateKey
    };
  });
