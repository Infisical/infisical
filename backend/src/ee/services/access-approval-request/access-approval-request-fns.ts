import { PackRule, unpackRules } from "@casl/ability/extra";

import { UnauthorizedError } from "@app/lib/errors";
import { TKmsServiceFactory } from "@app/services/kms/kms-service";
import { TProjectDALFactory } from "@app/services/project/project-dal";
import { TProjectSlackConfigDALFactory } from "@app/services/slack/project-slack-config-dal";
import { triggerSlackNotification } from "@app/services/slack/slack-fns";
import { SlackTriggerFeature } from "@app/services/slack/slack-types";

import { TVerifyPermission } from "./access-approval-request-types";

function filterUnique(value: string, index: number, array: string[]) {
  return array.indexOf(value) === index;
}

export const verifyRequestedPermissions = ({ permissions }: TVerifyPermission) => {
  const permission = unpackRules(
    permissions as PackRule<{
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      conditions?: Record<string, any>;
      action: string;
      subject: [string];
    }>[]
  );

  if (!permission || !permission.length) {
    throw new UnauthorizedError({ message: "No permission provided" });
  }

  const requestedPermissions: string[] = [];

  for (const p of permission) {
    if (p.action[0] === "read") requestedPermissions.push("Read Access");
    if (p.action[0] === "create") requestedPermissions.push("Create Access");
    if (p.action[0] === "delete") requestedPermissions.push("Delete Access");
    if (p.action[0] === "edit") requestedPermissions.push("Edit Access");
  }

  const firstPermission = permission[0];

  // eslint-disable-next-line @typescript-eslint/no-unused-vars, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access
  const permissionSecretPath = firstPermission.conditions?.secretPath?.$glob;
  // eslint-disable-next-line @typescript-eslint/no-unused-vars, @typescript-eslint/no-unsafe-assignment
  const permissionEnv = firstPermission.conditions?.environment;

  if (!permissionEnv || typeof permissionEnv !== "string") {
    throw new UnauthorizedError({ message: "Permission environment is not a string" });
  }
  if (!permissionSecretPath || typeof permissionSecretPath !== "string") {
    throw new UnauthorizedError({ message: "Permission path is not a string" });
  }

  return {
    envSlug: permissionEnv,
    secretPath: permissionSecretPath,
    accessTypes: requestedPermissions.filter(filterUnique)
  };
};

export const triggerAccessRequestSlackNotif = async ({
  projectId,
  projectName,
  requesterFullName,
  isTemporary,
  requesterEmail,
  secretPath,
  environment,
  permissions,
  approvalUrl,
  projectDAL,
  kmsService,
  projectSlackConfigDAL
}: {
  projectId: string;
  projectName: string;
  requesterFullName: string;
  isTemporary: boolean;
  requesterEmail: string;
  secretPath: string;
  environment: string;
  permissions: string[];
  approvalUrl: string;
  projectDAL: Pick<TProjectDALFactory, "findById" | "findProjectWithOrg">;
  kmsService: Pick<TKmsServiceFactory, "createCipherPairWithDataKey">;
  projectSlackConfigDAL: Pick<TProjectSlackConfigDALFactory, "getIntegrationDetailsByProject">;
}) => {
  const messageBody = `${requesterFullName} (${requesterEmail}) has requested ${
    isTemporary ? "temporary" : "permanent"
  } access to ${secretPath} in the ${environment} environment of ${projectName}.

The following permissions are requested: ${permissions.join(", ")}

View the request and approve or deny it <${approvalUrl}|here>.`;

  const payloadBlocks = [
    {
      type: "header",
      text: {
        type: "plain_text",
        text: "New access approval request pending for review",
        emoji: true
      }
    },
    {
      type: "section",
      text: {
        type: "mrkdwn",
        text: messageBody
      }
    }
  ];

  await triggerSlackNotification({
    projectId,
    projectDAL,
    kmsService,
    payloadMessage: messageBody,
    projectSlackConfigDAL,
    payloadBlocks,
    feature: SlackTriggerFeature.ACCESS_REQUEST
  });
};
