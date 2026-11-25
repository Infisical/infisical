import { EventType } from "../event-type";
import type { TAuditLogCertKeySource, TAuditLogCrlReason } from "./shared";

export interface CreatePkiSignerEvent {
  type: EventType.CREATE_PKI_SIGNER;
  metadata: {
    signerId: string;
    name: string;
    certificateId?: string | null;
    caId?: string | null;
    commonName?: string | null;
    approvalPolicyId?: string | null;
    keySource?: TAuditLogCertKeySource;
    hsmConnectorId?: string | null;
    hsmKeyLabel?: string;
    hsmKeyId?: string;
    externalConfiguration?: TAuditLogSignerExternalConfiguration;
  };
}

export interface UpdatePkiSignerEvent {
  type: EventType.UPDATE_PKI_SIGNER;
  metadata: {
    signerId: string;
    name: string;
  };
}

export interface DeletePkiSignerEvent {
  type: EventType.DELETE_PKI_SIGNER;
  metadata: {
    signerId: string;
    name: string;
  };
}

export interface GetPkiSignerEvent {
  type: EventType.GET_PKI_SIGNER;
  metadata: {
    signerId: string;
    name: string;
  };
}

export interface GetPkiSignersEvent {
  type: EventType.GET_PKI_SIGNERS;
  metadata: {
    count: number;
    offset: number;
    limit: number;
  };
}

export interface GetPkiSignerPublicKeyEvent {
  type: EventType.GET_PKI_SIGNER_PUBLIC_KEY;
  metadata: {
    signerId: string;
    name: string;
  };
}

export interface PkiSignerSignEvent {
  type: EventType.PKI_SIGNER_SIGN;
  metadata: {
    signerId: string;
    name: string;
    signingAlgorithm: string;
  };
}

export interface EnablePkiSignerEvent {
  type: EventType.ENABLE_PKI_SIGNER;
  metadata: {
    signerId: string;
    name: string;
  };
}

export interface DisablePkiSignerEvent {
  type: EventType.DISABLE_PKI_SIGNER;
  metadata: {
    signerId: string;
    name: string;
  };
}

export interface ReissuePkiSignerCertificateEvent {
  type: EventType.REISSUE_PKI_SIGNER_CERTIFICATE;
  metadata: {
    signerId: string;
    name: string;
    caId: string;
    commonName?: string;
    keyAlgorithm?: string;
    keySource?: string;
    hsmConnectorId?: string;
    hsmKeyAlgorithm?: string;
    externalConfiguration?: TAuditLogSignerExternalConfiguration;
  };
}

export interface RenewPkiSignerCertificateEvent {
  type: EventType.RENEW_PKI_SIGNER_CERTIFICATE;
  metadata: {
    signerId: string;
    name: string;
    status: string;
    caId: string;
    caName: string;
    previousSerialNumber: string | null;
  };
}

export interface RevokePkiSignerCertificateEvent {
  type: EventType.REVOKE_PKI_SIGNER_CERTIFICATE;
  metadata: {
    signerId: string;
    name: string;
    certificateId: string;
    certificateCommonName: string;
    serialNumber: string;
    revocationReason: TAuditLogCrlReason;
    status: string;
    digicertRevocationRequestId?: number;
  };
}

export interface PkiSignerCertificateRevocationDecidedEvent {
  type: EventType.PKI_SIGNER_CERTIFICATE_REVOCATION_DECIDED;
  metadata: {
    signerId: string;
    name: string;
    certificateId: string;
    certificateCommonName: string;
    serialNumber: string;
    revocationReason: TAuditLogCrlReason;
    digicertRevocationRequestId?: number;
    decision: string;
    status: string;
  };
}

export interface PkiSignerCertificateRevokedByCaEvent {
  type: EventType.PKI_SIGNER_CERTIFICATE_REVOKED_BY_CA;
  metadata: {
    signerId: string;
    name: string;
    certificateId: string;
    certificateCommonName: string;
    serialNumber: string;
    previousStatus: string;
    status: string;
  };
}

export interface ImportPkiSignerCertificateEvent {
  type: EventType.IMPORT_PKI_SIGNER_CERTIFICATE;
  metadata: {
    signerId: string;
    name: string;
    caId: string;
    caName: string;
    externalOrderId: string;
    certificateId?: string | null;
    commonName?: string;
    keyAlgorithm?: string;
    hsmConnectorId: string;
    hsmConnectorName: string;
    hsmKeyLabel: string;
    hsmKeyId?: string;
    certificateRenewBeforeDays?: number | null;
  };
}

export interface ExportPkiSignerCertificateEvent {
  type: EventType.EXPORT_PKI_SIGNER_CERTIFICATE;
  metadata: {
    signerId: string;
    name: string;
    serialNumber: string;
  };
}

export interface UpdatePkiSignerApprovalPolicyEvent {
  type: EventType.UPDATE_PKI_SIGNER_APPROVAL_POLICY;
  metadata: {
    signerId: string;
    name: string;
    stepCount: number;
  };
}

export interface PkiSignerRequestToSignEvent {
  type: EventType.PKI_SIGNER_REQUEST_TO_SIGN;
  metadata: {
    signerId: string;
    name: string;
    approvalRequestId?: string;
  };
}

export interface PkiSignerPreApproveSigningEvent {
  type: EventType.PKI_SIGNER_PRE_APPROVE_SIGNING;
  metadata: {
    signerId: string;
    name: string;
    approvalRequestId?: string;
    granteeUserId?: string;
    granteeIdentityId?: string;
  };
}

export interface PkiSignerRevokeRequestEvent {
  type: EventType.PKI_SIGNER_REVOKE_REQUEST;
  metadata: {
    signerId: string;
    name: string;
    approvalRequestId: string;
  };
}

export interface AddPkiSignerMemberEvent {
  type: EventType.ADD_PKI_SIGNER_MEMBER;
  metadata: {
    signerId: string;
    kind: string;
    role?: string;
    added?: number;
    userIds?: string[];
    identityId?: string;
    groupId?: string;
  };
}

export interface UpdatePkiSignerMemberEvent {
  type: EventType.UPDATE_PKI_SIGNER_MEMBER;
  metadata: {
    signerId: string;
    kind: string;
    memberId: string;
    role: string;
  };
}

export interface RemovePkiSignerMemberEvent {
  type: EventType.REMOVE_PKI_SIGNER_MEMBER;
  metadata: {
    signerId: string;
    kind: string;
    memberId: string;
  };
}

export type TAuditLogSignerExternalConfiguration = {
  caType?: "digicert" | "adcs";
  reissueFromExternalOrderId?: string;
  importFromExternalOrderId?: string;
  template?: string;
};

export type TSignerAuditLogEvent =
  | CreatePkiSignerEvent
  | UpdatePkiSignerEvent
  | DeletePkiSignerEvent
  | GetPkiSignerEvent
  | GetPkiSignersEvent
  | GetPkiSignerPublicKeyEvent
  | PkiSignerSignEvent
  | EnablePkiSignerEvent
  | DisablePkiSignerEvent
  | ReissuePkiSignerCertificateEvent
  | RenewPkiSignerCertificateEvent
  | RevokePkiSignerCertificateEvent
  | PkiSignerCertificateRevocationDecidedEvent
  | ImportPkiSignerCertificateEvent
  | ExportPkiSignerCertificateEvent
  | UpdatePkiSignerApprovalPolicyEvent
  | PkiSignerRequestToSignEvent
  | PkiSignerPreApproveSigningEvent
  | PkiSignerRevokeRequestEvent
  | AddPkiSignerMemberEvent
  | UpdatePkiSignerMemberEvent
  | RemovePkiSignerMemberEvent
  | PkiSignerCertificateRevokedByCaEvent;
