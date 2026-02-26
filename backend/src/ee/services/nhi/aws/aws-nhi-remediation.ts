import AWS from "aws-sdk";

import { logger } from "@app/lib/logger";
import { getAwsConnectionConfig } from "@app/services/app-connection/aws/aws-connection-fns";
import { TAwsConnectionConfig } from "@app/services/app-connection/aws/aws-connection-types";

import { NhiRemediationActionType } from "../nhi-enums";

type TAwsRemediationResult = {
  success: boolean;
  message: string;
  details?: Record<string, unknown>;
};

const deactivateAccessKey = async (iam: AWS.IAM, metadata: Record<string, unknown>): Promise<TAwsRemediationResult> => {
  const accessKeyId = metadata.accessKeyId as string;
  const userName = metadata.userName as string;

  if (!accessKeyId || !userName) {
    return { success: false, message: "Missing accessKeyId or userName in identity metadata" };
  }

  await iam.updateAccessKey({ AccessKeyId: accessKeyId, UserName: userName, Status: "Inactive" }).promise();

  return {
    success: true,
    message: `Access key ${accessKeyId} for user ${userName} has been deactivated`,
    details: { accessKeyId, userName }
  };
};

const deleteAccessKey = async (iam: AWS.IAM, metadata: Record<string, unknown>): Promise<TAwsRemediationResult> => {
  const accessKeyId = metadata.accessKeyId as string;
  const userName = metadata.userName as string;

  if (!accessKeyId || !userName) {
    return { success: false, message: "Missing accessKeyId or userName in identity metadata" };
  }

  await iam.deleteAccessKey({ AccessKeyId: accessKeyId, UserName: userName }).promise();

  return {
    success: true,
    message: `Access key ${accessKeyId} for user ${userName} has been deleted`,
    details: { accessKeyId, userName }
  };
};

const deactivateAllAccessKeys = async (
  iam: AWS.IAM,
  metadata: Record<string, unknown>
): Promise<TAwsRemediationResult> => {
  const userName = (metadata.userName as string) || (metadata.arn as string)?.split("/").pop();

  if (!userName) {
    return { success: false, message: "Missing userName in identity metadata" };
  }

  const keysResp = await iam.listAccessKeys({ UserName: userName }).promise();
  const activeKeys = (keysResp.AccessKeyMetadata || []).filter((k) => k.Status === "Active");

  if (activeKeys.length === 0) {
    return { success: true, message: `No active access keys found for user ${userName}` };
  }

  const deactivated: string[] = [];
  for (const key of activeKeys) {
    // eslint-disable-next-line no-await-in-loop
    await iam.updateAccessKey({ AccessKeyId: key.AccessKeyId!, UserName: userName, Status: "Inactive" }).promise();
    deactivated.push(key.AccessKeyId!);
  }

  return {
    success: true,
    message: `Deactivated ${deactivated.length} access key(s) for user ${userName}`,
    details: { userName, deactivatedKeys: deactivated }
  };
};

const removeAdminPoliciesUser = async (
  iam: AWS.IAM,
  metadata: Record<string, unknown>
): Promise<TAwsRemediationResult> => {
  const userName = (metadata.userName as string) || (metadata.arn as string)?.split("/").pop();

  if (!userName) {
    return { success: false, message: "Missing userName in identity metadata" };
  }

  const policiesResp = await iam.listAttachedUserPolicies({ UserName: userName }).promise();
  const adminPolicies = (policiesResp.AttachedPolicies || []).filter(
    (p) => p.PolicyArn === "arn:aws:iam::aws:policy/AdministratorAccess" || p.PolicyArn?.includes(":*")
  );

  if (adminPolicies.length === 0) {
    return { success: true, message: `No admin policies found attached to user ${userName}` };
  }

  const detached: string[] = [];
  for (const policy of adminPolicies) {
    try {
      // eslint-disable-next-line no-await-in-loop
      await iam.detachUserPolicy({ UserName: userName, PolicyArn: policy.PolicyArn! }).promise();
      detached.push(policy.PolicyArn!);
    } catch (err) {
      logger.warn(err, `Failed to detach policy ${policy.PolicyArn} from user ${userName}`);
    }
  }

  return {
    success: true,
    message: `Detached ${detached.length} admin policy/policies from user ${userName}`,
    details: { userName, detachedPolicies: detached }
  };
};

const removeAdminPoliciesRole = async (
  iam: AWS.IAM,
  metadata: Record<string, unknown>
): Promise<TAwsRemediationResult> => {
  const roleName = (metadata.arn as string)?.split("/").pop();

  if (!roleName) {
    return { success: false, message: "Missing role name in identity metadata" };
  }

  const policiesResp = await iam.listAttachedRolePolicies({ RoleName: roleName }).promise();
  const adminPolicies = (policiesResp.AttachedPolicies || []).filter(
    (p) => p.PolicyArn === "arn:aws:iam::aws:policy/AdministratorAccess" || p.PolicyArn?.includes(":*")
  );

  if (adminPolicies.length === 0) {
    return { success: true, message: `No admin policies found attached to role ${roleName}` };
  }

  const detached: string[] = [];
  for (const policy of adminPolicies) {
    try {
      // eslint-disable-next-line no-await-in-loop
      await iam.detachRolePolicy({ RoleName: roleName, PolicyArn: policy.PolicyArn! }).promise();
      detached.push(policy.PolicyArn!);
    } catch (err) {
      logger.warn(err, `Failed to detach policy ${policy.PolicyArn} from role ${roleName}`);
    }
  }

  return {
    success: true,
    message: `Detached ${detached.length} admin policy/policies from role ${roleName}`,
    details: { roleName, detachedPolicies: detached }
  };
};

export const executeAwsRemediation = async (
  appConnection: TAwsConnectionConfig,
  actionType: NhiRemediationActionType,
  metadata: Record<string, unknown>
): Promise<TAwsRemediationResult> => {
  const awsConfig = await getAwsConnectionConfig(appConnection);
  const iam = new AWS.IAM(awsConfig);

  switch (actionType) {
    case NhiRemediationActionType.DeactivateAccessKey:
      return deactivateAccessKey(iam, metadata);
    case NhiRemediationActionType.DeleteAccessKey:
      return deleteAccessKey(iam, metadata);
    case NhiRemediationActionType.DeactivateAllAccessKeys:
      return deactivateAllAccessKeys(iam, metadata);
    case NhiRemediationActionType.RemoveAdminPoliciesUser:
      return removeAdminPoliciesUser(iam, metadata);
    case NhiRemediationActionType.RemoveAdminPoliciesRole:
      return removeAdminPoliciesRole(iam, metadata);
    default:
      return { success: false, message: `Unsupported AWS remediation action: ${actionType}` };
  }
};
