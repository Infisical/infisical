export enum DelegatedApprovalPolicyType {
  ServiceNow = "servicenow"
}

export enum DelegatedApprovalRequestStatus {
  PendingDispatch = "pending_dispatch",
  WaitingApproval = "waiting_approval",
  FailedDispatch = "failed_dispatch",
  Approved = "approved",
  Rejected = "rejected",
  Failed = "failed"
}
