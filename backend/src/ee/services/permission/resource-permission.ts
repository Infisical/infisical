import { MongoAbility } from "@casl/ability";

import {
  ProjectPermissionActions,
  ProjectPermissionApprovalRequestActions,
  ProjectPermissionApprovalRequestGrantActions,
  ProjectPermissionCertificateProfileActions,
  ProjectPermissionMemberActions,
  ProjectPermissionSub
} from "./project-permission";

export enum ResourcePermissionSub {
  Application = "certificate-application",
  ApplicationEnrollment = "certificate-application-enrollment",
  ApprovalPolicies = "approval-policies",
  Certificates = "certificates",
  CertificateInventoryViews = "certificate-inventory-views",
  PkiSyncs = "pki-syncs",
  PkiAlerts = "pki-alerts",
  ApprovalRequests = "approval-requests",
  ApprovalRequestGrants = "approval-request-grants",
  Member = "member",
  Signer = "pki-signer",
  PamResource = "pam-resource" // folders and accounts
}

export enum ResourcePermissionPamResourceActions {
  ReadFolder = "read-folder",
  EditFolder = "edit-folder",
  DeleteFolder = "delete-folder",
  ReadAccounts = "read-accounts",
  CreateAccounts = "create-accounts",
  EditAccounts = "edit-accounts",
  DeleteAccounts = "delete-accounts",
  LaunchSessions = "launch-sessions",
  ViewSessions = "view-sessions",
  TerminateSessions = "terminate-sessions",
  ViewCredentials = "view-credentials",
  RequestAccess = "request-access",
  ApproveRequests = "approve-requests",
  ManagePolicies = "manage-policies",
  ManageRotation = "manage-rotation",
  ManageMembers = "manage-members",
  ViewAuditLogs = "view-audit-logs"
}

export enum ResourcePermissionSignerActions {
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

export enum ResourcePermissionApplicationActions {
  Read = "read",
  Edit = "edit",
  Delete = "delete",
  ManageProfiles = "manage-profiles"
}

export enum ResourcePermissionApplicationEnrollmentActions {
  Read = "read",
  Edit = "edit",
  RevealAcmeEabSecret = "reveal-acme-eab-secret",
  RotateAcmeEabSecret = "rotate-acme-eab-secret",
  GenerateScepChallenge = "generate-scep-challenge"
}

export enum ResourcePermissionApprovalPolicyActions {
  Read = "read",
  Create = "create",
  Edit = "edit",
  Delete = "delete"
}

export enum ResourcePermissionCertificateActions {
  Read = "read",
  List = "list",
  Create = "create",
  Edit = "edit",
  Delete = "delete",
  ReadPrivateKey = "read-private-key",
  Import = "import"
}

export enum ResourcePermissionPkiSyncActions {
  Read = "read",
  List = "list",
  Create = "create",
  Edit = "edit",
  Delete = "delete",
  SyncCertificates = "sync-certificates",
  ImportCertificates = "import-certificates",
  RemoveCertificates = "remove-certificates"
}

export type ResourcePermissionSet =
  | [ResourcePermissionApplicationActions, ResourcePermissionSub.Application]
  | [ResourcePermissionApplicationEnrollmentActions, ResourcePermissionSub.ApplicationEnrollment]
  | [ResourcePermissionApprovalPolicyActions, ResourcePermissionSub.ApprovalPolicies]
  | [ResourcePermissionCertificateActions, ResourcePermissionSub.Certificates]
  | [ProjectPermissionActions, ResourcePermissionSub.CertificateInventoryViews]
  | [ResourcePermissionPkiSyncActions, ResourcePermissionSub.PkiSyncs]
  | [ProjectPermissionActions, ResourcePermissionSub.PkiAlerts]
  | [ProjectPermissionApprovalRequestActions, ResourcePermissionSub.ApprovalRequests]
  | [ProjectPermissionApprovalRequestGrantActions, ResourcePermissionSub.ApprovalRequestGrants]
  | [ProjectPermissionMemberActions, ResourcePermissionSub.Member]
  | [ResourcePermissionSignerActions, ResourcePermissionSub.Signer]
  | [ResourcePermissionPamResourceActions, ResourcePermissionSub.PamResource]
  | [ProjectPermissionCertificateProfileActions, ProjectPermissionSub.CertificateProfiles];

export type TResourceAbility = MongoAbility<ResourcePermissionSet>;
