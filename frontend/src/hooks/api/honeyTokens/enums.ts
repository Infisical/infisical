export enum HoneyTokenType {
  AWS = "aws"
}

export enum HoneyTokenStatus {
  Active = "active",
  Triggered = "triggered",
  Revoked = "revoked"
}

export enum HoneyTokenManagedBy {
  Instance = "instance",
  Organization = "organization"
}

export enum AwsHoneyTokenDeploymentUnavailableReason {
  InstanceNotConfigured = "instance-not-configured",
  IncompleteAwsCredentials = "incomplete-aws-credentials",
  InvalidRoleArn = "invalid-role-arn",
  AccountNotConnected = "account-not-connected",
  StackVerificationPending = "stack-verification-pending"
}

export enum HoneyTokenConfigStatus {
  VerificationPending = "VERIFICATION_PENDING",
  Complete = "COMPLETE"
}
