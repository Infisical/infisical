export enum ExternalApprovalType {
  ServiceNow = "servicenow"
}

export enum ExternalApprovalProductType {
  SecretsManagement = "secrets_management"
}

export enum ExternalApprovalRequestStatus {
  PendingDispatch = "pending_dispatch",
  FailedDispatch = "failed_dispatch",
  WaitingApproval = "waiting_approval",
  Approved = "approved",
  Rejected = "rejected"
}
