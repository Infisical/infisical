// AWS SDK v3 exception classes are only generated for errors explicitly modeled in a service's API definition.
// Generic errors like ThrottlingException are not modeled by all services (e.g. Secrets Manager, KMS),
// so they cannot be caught with instanceof. This utility checks the error name directly as a fallback.
export const isAwsError = (error: unknown, name: string): boolean => (error as { name: string }).name === name;
