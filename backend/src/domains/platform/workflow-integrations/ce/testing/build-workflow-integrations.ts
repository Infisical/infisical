import { randomUUID } from "node:crypto";

import { packRules } from "@casl/ability/extra";

import { AccessScope, OrgMembershipRole } from "@app/db/schemas";
import { TActorContext } from "@app/domains/lib/actor-context";
import { TPermissionRule } from "@app/domains/platform/access-control/ce/module";
import { buildAccessControl } from "@app/domains/platform/access-control/ce/testing/build-access-control";
import { FakeInstanceConfigService } from "@app/domains/platform/instance-config-core/ce/testing/fake-instance-config-service";
import { KmsDataKey } from "@app/domains/platform/kms-core/ce/module";
import { FakeKmsCore } from "@app/domains/platform/kms-core/ce/testing/fake-kms-core";
import { OrgPermissionSet } from "@app/domains/platform/organizations/ce/module";
import {
  actorContext,
  actorOrg,
  userPrincipal
} from "@app/domains/platform/organizations/ce/testing/actor-context-fixture";
import { buildOrganizations } from "@app/domains/platform/organizations/ce/testing/build-organizations";

import { WorkflowIntegration } from "../models/workflow-integration";
import { WorkflowIntegrationsModule } from "../module";
import { FakeMicrosoftTeamsBot } from "./fake-microsoft-teams-bot";
import { FakeMicrosoftTeamsClient } from "./fake-microsoft-teams-client";
import { FakeSlackClient } from "./fake-slack-client";
import { InMemoryWorkflowIntegrationsStores } from "./in-memory-workflow-integrations-stores";

export const TEAMS_CREDENTIALS = { appId: "teams-app-id", clientSecret: "teams-secret", botId: "teams-bot-id" };

export const SITE_URL = "https://app.infisical.test";

type TBuildOptions = {
  isCloud?: boolean;
  // Instance credentials; omit a provider to leave it unconfigured.
  slack?: { clientId: string; clientSecret: string };
  microsoftTeams?: typeof TEAMS_CREDENTIALS;
  now?: () => Date;
};

// The real module over in-memory stores, with fake provider clients, a fake KMS (real AES) and real org permissions.
// `member(role)` makes an actor in a new org holding that org role.
export const buildWorkflowIntegrations = async ({
  isCloud = false,
  slack,
  microsoftTeams,
  now
}: TBuildOptions = {}) => {
  const memory = new InMemoryWorkflowIntegrationsStores();
  const kmsCore = new FakeKmsCore();
  const instanceConfigService = new FakeInstanceConfigService();
  if (slack || microsoftTeams) {
    await instanceConfigService.updateConfig({
      slackClientId: slack?.clientId,
      slackClientSecret: slack?.clientSecret,
      microsoftTeamsAppId: microsoftTeams?.appId,
      microsoftTeamsClientSecret: microsoftTeams?.clientSecret,
      microsoftTeamsBotId: microsoftTeams?.botId
    });
  }
  const access = buildAccessControl();
  const { orgPermissionService } = buildOrganizations(access);
  const slackClient = new FakeSlackClient();
  const microsoftTeamsClient = new FakeMicrosoftTeamsClient();
  const microsoftTeamsBot = new FakeMicrosoftTeamsBot();
  const refreshes: { name: string; intervalMs: number; task: () => Promise<void> }[] = [];

  const module = new WorkflowIntegrationsModule({
    transactionRunner: memory.transactionRunner,
    workflowIntegrationStore: memory.workflowIntegrationStore,
    orgPermissionService,
    kmsDataKeyService: kmsCore.kmsDataKeyService,
    instanceConfigService,
    siteUrl: SITE_URL,
    authSecret: "auth-secret",
    isCloud,
    isProductionMode: true,
    startLocalRefresh: ((input: { name: string; intervalMs: number; task: () => Promise<void> }) => {
      refreshes.push(input);
      return { stop: () => undefined };
    }) as never,
    slackClient,
    microsoftTeamsClient,
    microsoftTeamsBot,
    now
  });

  const member = async (
    role: OrgMembershipRole = OrgMembershipRole.Admin,
    orgId = randomUUID()
  ): Promise<TActorContext> => {
    const userId = randomUUID();
    await access.seed.membership({
      scope: AccessScope.Organization,
      orgId,
      actor: { userId },
      roles: [{ role }]
    });
    return actorContext({ principal: userPrincipal({ id: userId }), org: actorOrg({ id: orgId }) });
  };

  // An actor whose only org role is a custom one holding exactly these rules (none: no org permission at all).
  const memberWithRules = async (
    rules: TPermissionRule<OrgPermissionSet>[],
    orgId = randomUUID()
  ): Promise<TActorContext> => {
    const userId = randomUUID();
    const role = await access.seed.role({
      owner: { orgId },
      slug: `custom-${randomUUID()}`,
      permissions: packRules(rules)
    });
    await access.seed.membership({
      scope: AccessScope.Organization,
      orgId,
      actor: { userId },
      roles: [{ role: OrgMembershipRole.Custom, customRoleId: role.id }]
    });
    return actorContext({ principal: userPrincipal({ id: userId }), org: actorOrg({ id: orgId }) });
  };

  // Stores an integration directly, as if installed earlier.
  const seed = async (integration: WorkflowIntegration) => {
    await memory.workflowIntegrationStore.create(integration);
    return integration;
  };

  // Encrypts with the org's data key, as the module does for bot tokens.
  const encryptForOrg = async (orgId: string, plainText: string) => {
    const { encryptor } = await kmsCore.kmsDataKeyService.createCipherPairWithDataKey({
      type: KmsDataKey.Organization,
      orgId
    });
    return encryptor({ plainText: Buffer.from(plainText, "utf8") }).cipherTextBlob;
  };

  const decryptForOrg = async (orgId: string, cipherTextBlob: Buffer) => {
    const { decryptor } = await kmsCore.kmsDataKeyService.createCipherPairWithDataKey({
      type: KmsDataKey.Organization,
      orgId
    });
    return decryptor({ cipherTextBlob }).toString("utf8");
  };

  return {
    module,
    memory,
    instanceConfigService,
    slackClient,
    microsoftTeamsClient,
    microsoftTeamsBot,
    refreshes,
    member,
    memberWithRules,
    seed,
    encryptForOrg,
    decryptForOrg
  };
};
