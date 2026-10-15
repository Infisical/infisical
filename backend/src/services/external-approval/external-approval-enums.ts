export enum ExternalApprovalPolicyType {
  ServiceNow = "servicenow"
}

export enum ExternalApprovalRequestStatus {
  PendingDispatch = "pending_dispatch",
  WaitingApproval = "waiting_approval",
  FailedDispatch = "failed_dispatch",
  Approved = "approved",
  Rejected = "rejected",
  Failed = "failed"
}
