import AWS from "aws-sdk";

import { logger } from "@app/lib/logger";
import { getAwsConnectionConfig } from "@app/services/app-connection/aws/aws-connection-fns";
import { TAwsConnectionConfig } from "@app/services/app-connection/aws/aws-connection-types";

import { NhiIdentityType, NhiProvider } from "../nhi-enums";
import { TRawNhiIdentity } from "../nhi-scanner-types";

const listAllUsers = async (iam: AWS.IAM): Promise<AWS.IAM.User[]> => {
  const users: AWS.IAM.User[] = [];
  let marker: string | undefined;

  do {
    // eslint-disable-next-line no-await-in-loop
    const resp = await iam.listUsers({ Marker: marker }).promise();
    users.push(...(resp.Users || []));
    marker = resp.IsTruncated ? resp.Marker : undefined;
  } while (marker);

  return users;
};

const listAllRoles = async (iam: AWS.IAM): Promise<AWS.IAM.Role[]> => {
  const roles: AWS.IAM.Role[] = [];
  let marker: string | undefined;

  do {
    // eslint-disable-next-line no-await-in-loop
    const resp = await iam.listRoles({ Marker: marker }).promise();
    roles.push(...(resp.Roles || []));
    marker = resp.IsTruncated ? resp.Marker : undefined;
  } while (marker);

  return roles;
};

const scanIamUser = async (iam: AWS.IAM, user: AWS.IAM.User): Promise<TRawNhiIdentity[]> => {
  const identities: TRawNhiIdentity[] = [];

  const [policiesResp, keysResp] = await Promise.all([
    iam.listAttachedUserPolicies({ UserName: user.UserName }).promise(),
    iam.listAccessKeys({ UserName: user.UserName }).promise()
  ]);

  const policies = (policiesResp.AttachedPolicies || []).map((p) => p.PolicyArn || "");

  // The user itself
  identities.push({
    externalId: user.Arn,
    name: user.UserName,
    type: NhiIdentityType.IamUser,
    provider: NhiProvider.AWS,
    metadata: {
      arn: user.Arn,
      userId: user.UserId,
      createDate: user.CreateDate?.toISOString(),
      passwordLastUsed: user.PasswordLastUsed?.toISOString(),
      policies,
      path: user.Path
    },
    policies,
    keyCreateDate: user.CreateDate || null,
    keyLastUsedDate: user.PasswordLastUsed || null,
    lastActivityAt: user.PasswordLastUsed || null
  });

  // Each access key as a separate identity
  for (const key of keysResp.AccessKeyMetadata || []) {
    let keyLastUsed: Date | null = null;
    try {
      // eslint-disable-next-line no-await-in-loop
      const lastUsedResp = await iam.getAccessKeyLastUsed({ AccessKeyId: key.AccessKeyId! }).promise();
      keyLastUsed = lastUsedResp.AccessKeyLastUsed?.LastUsedDate || null;
    } catch (err) {
      logger.warn(err, `Failed to get last used info for access key ${key.AccessKeyId}`);
    }

    identities.push({
      externalId: key.AccessKeyId!,
      name: `${user.UserName}/${key.AccessKeyId}`,
      type: NhiIdentityType.IamAccessKey,
      provider: NhiProvider.AWS,
      metadata: {
        accessKeyId: key.AccessKeyId,
        userName: user.UserName,
        userArn: user.Arn,
        status: key.Status,
        createDate: key.CreateDate?.toISOString(),
        lastUsedDate: keyLastUsed?.toISOString() || null,
        policies
      },
      policies,
      keyCreateDate: key.CreateDate || null,
      keyLastUsedDate: keyLastUsed,
      lastActivityAt: keyLastUsed
    });
  }

  return identities;
};

const scanIamRole = async (iam: AWS.IAM, role: AWS.IAM.Role): Promise<TRawNhiIdentity> => {
  const policiesResp = await iam.listAttachedRolePolicies({ RoleName: role.RoleName }).promise();
  const attachedPolicies = (policiesResp.AttachedPolicies || []) as AWS.IAM.AttachedPolicy[];
  const policies = attachedPolicies.map((p) => p.PolicyArn || "");

  let trustPolicy: unknown = null;
  try {
    trustPolicy = role.AssumeRolePolicyDocument
      ? (JSON.parse(decodeURIComponent(role.AssumeRolePolicyDocument)) as unknown)
      : null;
  } catch {
    trustPolicy = role.AssumeRolePolicyDocument;
  }

  return {
    externalId: role.Arn,
    name: role.RoleName,
    type: NhiIdentityType.IamRole,
    provider: NhiProvider.AWS,
    metadata: {
      arn: role.Arn,
      roleId: role.RoleId,
      createDate: role.CreateDate?.toISOString(),
      description: role.Description,
      maxSessionDuration: role.MaxSessionDuration,
      path: role.Path,
      policies,
      trustPolicy: trustPolicy as Record<string, unknown>
    },
    policies,
    keyCreateDate: role.CreateDate || null,
    keyLastUsedDate: role.RoleLastUsed?.LastUsedDate || null,
    lastActivityAt: role.RoleLastUsed?.LastUsedDate || null
  };
};

export const scanAwsIamIdentities = async (appConnection: TAwsConnectionConfig): Promise<TRawNhiIdentity[]> => {
  const awsConfig = await getAwsConnectionConfig(appConnection);
  const iam = new AWS.IAM(awsConfig);
  const identities: TRawNhiIdentity[] = [];

  // Scan users and their access keys
  const users = await listAllUsers(iam);
  const userResults = await Promise.all(users.map((user) => scanIamUser(iam, user)));
  for (const userIdentities of userResults) {
    identities.push(...userIdentities);
  }

  // Scan roles
  const roles = await listAllRoles(iam);
  const roleResults = await Promise.all(roles.map((role) => scanIamRole(iam, role)));
  identities.push(...roleResults);

  return identities;
};
