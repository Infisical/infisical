import FileSaver from "file-saver";

import { KmsKeyUsage, TCmekBulkExportedKey } from "@app/hooks/api/cmeks/types";

type CmekExportEntry =
  | {
      name: string;
      keyType: "encrypt-decrypt";
      algorithm: string;
      keyMaterial: string;
    }
  | {
      name: string;
      keyType: "sign-verify";
      algorithm: string;
      privateKey: string;
      publicKey: string;
    }
  | {
      name: string;
      keyType: "generate-verify-mac";
      algorithm: string;
      keyMaterial: string;
    };

export const cmekKeysToExportJSON = (keys: TCmekBulkExportedKey[]): CmekExportEntry[] => {
  return keys.map((key) => {
    if (key.keyUsage === KmsKeyUsage.SIGN_VERIFY) {
      return {
        name: key.name,
        keyType: "sign-verify" as const,
        algorithm: key.algorithm,
        privateKey: key.privateKey,
        publicKey: key.publicKey ?? ""
      };
    }

    if (key.keyUsage === KmsKeyUsage.GENERATE_VERIFY_MAC) {
      return {
        name: key.name,
        keyType: "generate-verify-mac" as const,
        algorithm: key.algorithm,
        keyMaterial: key.privateKey
      };
    }

    return {
      name: key.name,
      keyType: "encrypt-decrypt" as const,
      algorithm: key.algorithm,
      keyMaterial: key.privateKey
    };
  });
};

export const downloadJSON = (data: unknown, filename: string) => {
  const blob = new Blob([JSON.stringify(data, null, 2)], {
    type: "application/json;charset=utf-8;"
  });
  FileSaver.saveAs(blob, filename);
};
