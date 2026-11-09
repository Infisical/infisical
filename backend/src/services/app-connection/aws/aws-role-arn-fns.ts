type TRoleArnParts = { partition: string; accountId: string; resource: string };

const parseRoleArn = (roleArn: string | undefined): TRoleArnParts | null => {
  const match = /^arn:([a-z0-9-]+):iam::(\d{12}):(role\/.+)$/.exec(roleArn ?? "");
  return match ? { partition: match[1], accountId: match[2], resource: match[3] } : null;
};

// The stack records no account ID, so the account comes from the connection's current Role ARN.
export const doesRoleArnBelongToStack = ({
  roleArn,
  existingRoleArn,
  provisioning
}: {
  roleArn: string;
  existingRoleArn: string | undefined;
  provisioning: { partition: string; roleName?: string };
}) => {
  if (roleArn === existingRoleArn) return true;
  if (!provisioning.roleName) return false;

  const requested = parseRoleArn(roleArn);
  const existing = parseRoleArn(existingRoleArn);
  if (!requested || !existing) return false;

  return (
    requested.partition === provisioning.partition &&
    requested.accountId === existing.accountId &&
    requested.resource === `role/${provisioning.roleName}`
  );
};
