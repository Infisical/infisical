import { randomUUID } from "node:crypto";

import type { TDbClient } from "@app/db";
import { AccessScope, OrgMembershipRole } from "@app/db/schemas";
import { buildAccessControl } from "@app/domains/platform/access-control/ce/testing/build-access-control";
import { FakeInstanceConfigService } from "@app/domains/platform/instance-config-core/ce/testing/fake-instance-config-service";
import { FakeKmsCore } from "@app/domains/platform/kms-core/ce/testing/fake-kms-core";
import {
  actorContext,
  actorOrg,
  userPrincipal
} from "@app/domains/platform/organizations/ce/testing/actor-context-fixture";
import { buildOrganizations } from "@app/domains/platform/organizations/ce/testing/build-organizations";
import { WorkflowIntegrationsModule } from "@app/domains/platform/workflow-integrations/ce/module";
import { FakeMicrosoftTeamsBot } from "@app/domains/platform/workflow-integrations/ce/testing/fake-microsoft-teams-bot";
import { FakeMicrosoftTeamsClient } from "@app/domains/platform/workflow-integrations/ce/testing/fake-microsoft-teams-client";
import { FakeSlackClient } from "@app/domains/platform/workflow-integrations/ce/testing/fake-slack-client";

const SLACK = { clientId: "slack-client", clientSecret: "slack-secret" };
const TEAMS = { appId: "teams-app", clientSecret: "teams-secret", botId: "teams-bot" };

// For integration tests that need real Slack and Teams integration rows (the chat config tables point at them). It
// installs them through Workflow Integrations' own services, over Postgres, with fake providers.
export const seedWorkflowIntegrations = async (db: TDbClient) => {
  const access = buildAccessControl();
  const { orgPermissionService } = buildOrganizations(access);
  const instanceConfigService = new FakeInstanceConfigService();
  await instanceConfigService.updateConfig({
    slackClientId: SLACK.clientId,
    slackClientSecret: SLACK.clientSecret,
    microsoftTeamsAppId: TEAMS.appId,
    microsoftTeamsClientSecret: TEAMS.clientSecret,
    microsoftTeamsBotId: TEAMS.botId
  });
  const slackClient = new FakeSlackClient();
  const microsoftTeamsClient = new FakeMicrosoftTeamsClient();
  const module = new WorkflowIntegrationsModule({
    db,
    orgPermissionService,
    kmsDataKeyService: new FakeKmsCore().kmsDataKeyService,
    instanceConfigService,
    siteUrl: "https://app.infisical.test",
    authSecret: "auth-secret",
    isCloud: false,
    isProductionMode: false,
    startLocalRefresh: (() => ({ stop: () => undefined })) as never,
    slackClient,
    microsoftTeamsClient,
    microsoftTeamsBot: new FakeMicrosoftTeamsBot()
  });

  const adminOf = async (orgId: string) => {
    const userId = randomUUID();
    await access.seed.membership({
      scope: AccessScope.Organization,
      orgId,
      actor: { userId },
      roles: [{ role: OrgMembershipRole.Admin }]
    });
    return actorContext({ principal: userPrincipal({ id: userId }), org: actorOrg({ id: orgId }) });
  };

  const slack = async (orgId: string): Promise<string> => {
    const slug = `slack-${randomUUID().slice(0, 8)}`;
    slackClient.nextInstall = { metadata: JSON.stringify({ slug, orgId }) };
    await module.slackIntegrationService.handleOAuthCallback({
      request: {} as never,
      response: {} as never,
      onSuccess: async () => undefined,
      onFailure: async () => {
        throw new Error("The Slack install failed");
      }
    });
    const actor = await adminOf(orgId);
    const installed = (await module.slackIntegrationService.list({ actor })).find((i) => i.slug === slug);
    return installed!.id;
  };

  // Installed: the bot is already in the tenant.
  const microsoftTeams = async (orgId: string): Promise<string> => {
    const tenantId = randomUUID();
    microsoftTeamsClient.tenants.set(tenantId, { installedAppId: "catalog-app" });
    const integration = await module.microsoftTeamsIntegrationService.complete({
      actor: await adminOf(orgId),
      tenantId,
      slug: `teams-${randomUUID().slice(0, 8)}`,
      code: "consent-code",
      redirectUri: "https://app.infisical.test/callback"
    });
    return integration.id;
  };

  return { module, slack, microsoftTeams };
};
