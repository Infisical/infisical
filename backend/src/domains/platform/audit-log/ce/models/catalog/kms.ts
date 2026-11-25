import { SymmetricKeyAlgorithm } from "@app/lib/crypto/cipher";
import { HmacAlgorithm } from "@app/lib/crypto/hmac";
import { AsymmetricKeyAlgorithm, SigningAlgorithm } from "@app/lib/crypto/sign/types";

import { EventType } from "../event-type";
import type { TAuditLogCertKeyAlgorithm, TAuditLogKmipPermission } from "./shared";

export interface CreateKmsEvent {
  type: EventType.CREATE_KMS;
  metadata: {
    kmsId: string;
    provider: string;
    name: string;
    description?: string;
  };
}

export interface DeleteKmsEvent {
  type: EventType.DELETE_KMS;
  metadata: {
    kmsId: string;
    name: string;
  };
}

export interface UpdateKmsEvent {
  type: EventType.UPDATE_KMS;
  metadata: {
    kmsId: string;
    provider: string;
    name?: string;
    description?: string;
  };
}

export interface GetKmsEvent {
  type: EventType.GET_KMS;
  metadata: {
    kmsId: string;
    name: string;
  };
}

export interface UpdateProjectKmsEvent {
  type: EventType.UPDATE_PROJECT_KMS;
  metadata: {
    secretManagerKmsKey: {
      id: string;
      name: string;
    };
  };
}

export interface GetProjectKmsBackupEvent {
  type: EventType.GET_PROJECT_KMS_BACKUP;
  metadata: Record<string, string>; // no metadata yet
}

export interface LoadProjectKmsBackupEvent {
  type: EventType.LOAD_PROJECT_KMS_BACKUP;
  metadata: Record<string, string>; // no metadata yet
}

export interface CreateCmekEvent {
  type: EventType.CREATE_CMEK;
  metadata: {
    keyId: string;
    name: string;
    description?: string;
    encryptionAlgorithm: SymmetricKeyAlgorithm | AsymmetricKeyAlgorithm | HmacAlgorithm;
    isExportable?: boolean;
    hasDeleteProtection?: boolean;
    isPublicKeyPublished?: boolean;
  };
}

export interface DeleteCmekEvent {
  type: EventType.DELETE_CMEK;
  metadata: {
    keyId: string;
  };
}

export interface UpdateCmekEvent {
  type: EventType.UPDATE_CMEK;
  metadata: {
    keyId: string;
    keyName: string;
    name?: string;
    description?: string;
    hasDeleteProtection?: boolean;
    isPublicKeyPublished?: boolean;
  };
}

export interface RotateCmekEvent {
  type: EventType.ROTATE_CMEK;
  metadata: {
    keyId: string;
    version: number;
  };
}

export interface GetCmeksEvent {
  type: EventType.GET_CMEKS;
  metadata: {
    keyIds: string[];
  };
}

export interface GetCmekEvent {
  type: EventType.GET_CMEK;
  metadata: {
    keyId: string;
  };
}

export interface CmekEncryptEvent {
  type: EventType.CMEK_ENCRYPT;
  metadata: {
    keyId: string;
  };
}

export interface CmekDecryptEvent {
  type: EventType.CMEK_DECRYPT;
  metadata: {
    keyId: string;
  };
}

export interface CmekSignEvent {
  type: EventType.CMEK_SIGN;
  metadata: {
    keyId: string;
    signingAlgorithm: SigningAlgorithm;
    signature: string;
  };
}

export interface CmekVerifyEvent {
  type: EventType.CMEK_VERIFY;
  metadata: {
    keyId: string;
    signingAlgorithm: SigningAlgorithm;
    signature: string;
    signatureValid: boolean;
  };
}

export interface CmekGenerateMacEvent {
  type: EventType.CMEK_GENERATE_MAC;
  metadata: {
    keyId: string;
    macAlgorithm: HmacAlgorithm;
    mac: string;
  };
}

export interface CmekVerifyMacEvent {
  type: EventType.CMEK_VERIFY_MAC;
  metadata: {
    keyId: string;
    macAlgorithm: HmacAlgorithm;
    mac: string;
    macValid: boolean;
  };
}

export interface CmekListSigningAlgorithmsEvent {
  type: EventType.CMEK_LIST_SIGNING_ALGORITHMS;
  metadata: {
    keyId: string;
  };
}

export interface CmekGetPublicKeyEvent {
  type: EventType.CMEK_GET_PUBLIC_KEY;
  metadata: {
    keyId: string;
    keyName: string;
  };
}

export interface CmekGetPrivateKeyEvent {
  type: EventType.CMEK_GET_PRIVATE_KEY;
  metadata: {
    keyId: string;
    keyName: string;
  };
}

export interface CmekBulkGetPrivateKeysEvent {
  type: EventType.CMEK_BULK_EXPORT_PRIVATE_KEYS;
  metadata: {
    keys: { keyId: string; name: string }[];
  };
}

export interface CmekBulkImportKeysEvent {
  type: EventType.CMEK_BULK_IMPORT_KEYS;
  metadata: {
    keyNames: string[];
    failedKeyNames: string[];
    projectId: string;
  };
}

export interface CreateKmipClientEvent {
  type: EventType.CREATE_KMIP_CLIENT;
  metadata: {
    name: string;
    id: string;
    permissions: TAuditLogKmipPermission[];
  };
}

export interface UpdateKmipClientEvent {
  type: EventType.UPDATE_KMIP_CLIENT;
  metadata: {
    name: string;
    id: string;
    permissions: TAuditLogKmipPermission[];
  };
}

export interface DeleteKmipClientEvent {
  type: EventType.DELETE_KMIP_CLIENT;
  metadata: {
    id: string;
  };
}

export interface GetKmipClientEvent {
  type: EventType.GET_KMIP_CLIENT;
  metadata: {
    id: string;
  };
}

export interface GetKmipClientsEvent {
  type: EventType.GET_KMIP_CLIENTS;
  metadata: {
    ids: string[];
  };
}

export interface CreateKmipClientCertificateEvent {
  type: EventType.CREATE_KMIP_CLIENT_CERTIFICATE;
  metadata: {
    clientId: string;
    ttl: string;
    keyAlgorithm?: string;
    serialNumber: string;
    isFromCsr: boolean;
  };
}

export interface KmipOperationGetEvent {
  type: EventType.KMIP_OPERATION_GET;
  metadata: {
    id: string;
  };
}

export interface KmipOperationDestroyEvent {
  type: EventType.KMIP_OPERATION_DESTROY;
  metadata: {
    id: string;
  };
}

export interface KmipOperationCreateEvent {
  type: EventType.KMIP_OPERATION_CREATE;
  metadata: {
    id: string;
    algorithm: string;
  };
}

export interface KmipOperationGetAttributesEvent {
  type: EventType.KMIP_OPERATION_GET_ATTRIBUTES;
  metadata: {
    id: string;
  };
}

export interface KmipOperationActivateEvent {
  type: EventType.KMIP_OPERATION_ACTIVATE;
  metadata: {
    id: string;
  };
}

export interface KmipOperationRevokeEvent {
  type: EventType.KMIP_OPERATION_REVOKE;
  metadata: {
    id: string;
  };
}

export interface KmipOperationLocateEvent {
  type: EventType.KMIP_OPERATION_LOCATE;
  metadata: {
    ids: string[];
  };
}

export interface KmipOperationRegisterEvent {
  type: EventType.KMIP_OPERATION_REGISTER;
  metadata: {
    id: string;
    algorithm: string;
    name: string;
  };
}

export interface SetupKmipEvent {
  type: EventType.SETUP_KMIP;
  metadata: {
    keyAlgorithm: TAuditLogCertKeyAlgorithm;
  };
}

export interface GetKmipEvent {
  type: EventType.GET_KMIP;
  metadata: {
    id: string;
  };
}

export type TKmsAuditLogEvent =
  | CreateKmsEvent
  | DeleteKmsEvent
  | UpdateKmsEvent
  | GetKmsEvent
  | UpdateProjectKmsEvent
  | GetProjectKmsBackupEvent
  | LoadProjectKmsBackupEvent
  | CreateCmekEvent
  | DeleteCmekEvent
  | UpdateCmekEvent
  | RotateCmekEvent
  | GetCmeksEvent
  | GetCmekEvent
  | CmekEncryptEvent
  | CmekDecryptEvent
  | CmekSignEvent
  | CmekVerifyEvent
  | CmekGenerateMacEvent
  | CmekVerifyMacEvent
  | CmekListSigningAlgorithmsEvent
  | CmekGetPublicKeyEvent
  | CmekGetPrivateKeyEvent
  | CmekBulkGetPrivateKeysEvent
  | CmekBulkImportKeysEvent
  | CreateKmipClientEvent
  | UpdateKmipClientEvent
  | DeleteKmipClientEvent
  | GetKmipClientEvent
  | GetKmipClientsEvent
  | CreateKmipClientCertificateEvent
  | KmipOperationGetEvent
  | KmipOperationDestroyEvent
  | KmipOperationCreateEvent
  | KmipOperationGetAttributesEvent
  | KmipOperationActivateEvent
  | KmipOperationRevokeEvent
  | KmipOperationLocateEvent
  | KmipOperationRegisterEvent
  | SetupKmipEvent
  | GetKmipEvent;
