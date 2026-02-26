export enum NhiProvider {
  AWS = "aws",
  GitHub = "github"
}

export enum NhiIdentityType {
  IamUser = "iam_user",
  IamRole = "iam_role",
  IamAccessKey = "iam_access_key",
  GitHubAppInstallation = "github_app_installation",
  GitHubDeployKey = "github_deploy_key",
  GitHubFinegrainedPat = "github_finegrained_pat"
}

export enum NhiScanStatus {
  Scanning = "scanning",
  Completed = "completed",
  Failed = "failed"
}

export enum NhiIdentityStatus {
  Active = "active",
  Inactive = "inactive",
  Flagged = "flagged"
}

export enum NhiRemediationActionType {
  DeactivateAccessKey = "deactivate_access_key",
  DeleteAccessKey = "delete_access_key",
  DeactivateAllAccessKeys = "deactivate_all_access_keys",
  RemoveAdminPoliciesUser = "remove_admin_policies_user",
  RemoveAdminPoliciesRole = "remove_admin_policies_role",
  DeleteDeployKey = "delete_deploy_key",
  RevokeFinegrainedPat = "revoke_finegrained_pat",
  SuspendAppInstallation = "suspend_app_installation"
}

export enum NhiRemediationStatus {
  Pending = "pending",
  InProgress = "in_progress",
  Completed = "completed",
  Failed = "failed"
}

export enum NhiPolicyActionTaken {
  Remediate = "remediate",
  Flag = "flag",
  RemediateAndFlag = "remediate_and_flag"
}

export enum NhiPolicyExecutionStatus {
  Completed = "completed",
  Failed = "failed"
}
