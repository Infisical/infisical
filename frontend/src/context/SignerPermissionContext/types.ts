export enum SignerPermissionSub {
  Signer = "pki-signer"
}

export enum SignerPermissionActions {
  Read = "read",
  Edit = "edit",
  Delete = "delete",
  ManageStatus = "manage-status",
  ManageMembers = "manage-members",
  ManagePolicy = "manage-policy",
  Sign = "sign",
  RequestSign = "request-sign",
  PreApprove = "pre-approve",
  RevokeRequest = "revoke-request",
  ReissueCertificate = "reissue-certificate",
  ExportCertificate = "export-certificate"
}

export type SignerPermissionSet = [SignerPermissionActions, SignerPermissionSub.Signer];
