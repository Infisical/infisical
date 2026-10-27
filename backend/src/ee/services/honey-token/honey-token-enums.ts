export enum HoneyTokenType {
  AWS = "aws"
}

export enum HoneyTokenStatus {
  Active = "active",
  Triggered = "triggered",
  Revoked = "revoked"
}

export enum HoneyTokenHosting {
  InfisicalManaged = "infisical-managed",
  CustomerAccount = "customer-account"
}

export enum HoneyTokenManagedUnavailableReason {
  NotConfigured = "not-configured",
  IncompleteAwsCredentials = "incomplete-aws-credentials",
  InvalidRoleArn = "invalid-role-arn"
}

export enum HoneyTokenEventType {
  AWS = "aws"
}
