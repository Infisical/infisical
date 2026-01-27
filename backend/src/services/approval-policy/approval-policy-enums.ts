export enum ApprovalPolicyType {
  PamAccess = "pam-access",
  CertRequest = "cert-request"
}

export enum ApproverType {
  Group = "group",
  User = "user"
}

export enum ApprovalRequestStatus {
  Pending = "pending",
  Approved = "approved",
  Rejected = "rejected",
  Expired = "expired",
  Cancelled = "cancelled"
}

export enum ApprovalRequestStepStatus {
  Pending = "pending",
  InProgress = "in-progress",
  Completed = "completed"
}

export enum ApprovalRequestApprovalDecision {
  Approved = "approved",
  Rejected = "rejected"
}

export enum ApprovalRequestGrantStatus {
  Active = "active",
  Expired = "expired",
  Revoked = "revoked"
}
