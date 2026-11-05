export enum AwsHoneyTokenDeploymentUnavailableReason {
  InstanceNotConfigured = "instance-not-configured",
  IncompleteAwsCredentials = "incomplete-aws-credentials",
  InvalidRoleArn = "invalid-role-arn",
  AccountNotConnected = "account-not-connected",
  StackVerificationPending = "stack-verification-pending"
}

export type TAwsHoneyTokenInstanceUnavailableReason =
  | AwsHoneyTokenDeploymentUnavailableReason.InstanceNotConfigured
  | AwsHoneyTokenDeploymentUnavailableReason.IncompleteAwsCredentials
  | AwsHoneyTokenDeploymentUnavailableReason.InvalidRoleArn;
