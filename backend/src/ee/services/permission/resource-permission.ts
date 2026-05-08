import { MongoAbility } from "@casl/ability";

import {
  ProjectPermissionActions,
  ProjectPermissionApprovalRequestActions,
  ProjectPermissionApprovalRequestGrantActions,
  ProjectPermissionAuditLogsActions,
  ProjectPermissionCertificateProfileActions,
  ProjectPermissionMemberActions,
  ProjectPermissionSub
} from "./project-permission";

export enum ResourcePermissionSub {
  Application = "certificate-application",
  ApplicationEnrollment = "certificate-application-enrollment",
  ApprovalPolicies = "approval-policies",
  Certificates = "certificates",
  PkiSyncs = "pki-syncs",
  PkiAlerts = "pki-alerts",
  ApprovalRequests = "approval-requests",
  ApprovalRequestGrants = "approval-request-grants",
  Member = "member",
  Role = "role"
}

export enum ResourcePermissionApplicationActions {
  Read = "read",
  Edit = "edit",
  Delete = "delete"
}

export enum ResourcePermissionApplicationEnrollmentActions {
  Read = "read",
  Edit = "edit",
  RevealAcmeEabSecret = "reveal-acme-eab-secret",
  RotateAcmeEabSecret = "rotate-acme-eab-secret"
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
  | [ResourcePermissionPkiSyncActions, ResourcePermissionSub.PkiSyncs]
  | [ProjectPermissionActions, ResourcePermissionSub.PkiAlerts]
  | [ProjectPermissionApprovalRequestActions, ResourcePermissionSub.ApprovalRequests]
  | [ProjectPermissionApprovalRequestGrantActions, ResourcePermissionSub.ApprovalRequestGrants]
  | [ProjectPermissionMemberActions, ResourcePermissionSub.Member]
  | [ProjectPermissionActions, ResourcePermissionSub.Role]
  | [ProjectPermissionCertificateProfileActions, ProjectPermissionSub.CertificateProfiles]
  | [ProjectPermissionAuditLogsActions, ProjectPermissionSub.AuditLogs];

export type TResourceAbility = MongoAbility<ResourcePermissionSet>;
