import { randomBytes, randomUUID } from "node:crypto";

import { SlackInstallation } from "../models/slack-installation";
import { WorkflowIntegration } from "../models/workflow-integration";

const suffix = () => randomUUID().slice(0, 8);

export const slackInstallation = (overrides: { teamId?: string; teamName?: string } = {}) =>
  SlackInstallation.restore({
    teamId: overrides.teamId ?? `T${suffix()}`,
    teamName: overrides.teamName ?? `team-${suffix()}`,
    slackUserId: `U${suffix()}`,
    slackAppId: `A${suffix()}`,
    slackBotId: `B${suffix()}`,
    slackBotUserId: `U${suffix()}`,
    encryptedBotAccessToken: randomBytes(32)
  });

export const slackIntegration = (input: {
  orgId: string;
  slug?: string;
  description?: string | null;
  installation?: SlackInstallation;
}) =>
  WorkflowIntegration.createSlack({
    orgId: input.orgId,
    slug: input.slug ?? `slack-${suffix()}`,
    description: input.description,
    installation: input.installation ?? slackInstallation()
  });

export const microsoftTeamsIntegration = (input: {
  orgId: string;
  slug?: string;
  description?: string | null;
  tenantId?: string;
}) =>
  WorkflowIntegration.createMicrosoftTeams({
    orgId: input.orgId,
    slug: input.slug ?? `teams-${suffix()}`,
    description: input.description,
    tenantId: input.tenantId ?? randomUUID()
  });
