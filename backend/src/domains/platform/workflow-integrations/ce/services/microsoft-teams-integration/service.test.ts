import { randomUUID } from "node:crypto";

import { OrgMembershipRole } from "@app/db/schemas";
import { EntityNotFoundError, PermissionDeniedError, RuleViolationError } from "@app/domains/lib/errors";

import { WorkflowIntegrationStatus } from "../../models/enums";
import { MicrosoftTeamsTokenKind } from "../../models/microsoft-teams-installation";
import { WorkflowIntegration } from "../../models/workflow-integration";
import { buildWorkflowIntegrations, TEAMS_CREDENTIALS } from "../../testing/build-workflow-integrations";
import { microsoftTeamsIntegration, slackIntegration } from "../../testing/workflow-integration-fixture";

vi.mock("@app/lib/logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }
}));

const NOW = new Date("2026-03-01T12:00:00.000Z");
const MINUTE = 60 * 1000;

const build = (options: Parameters<typeof buildWorkflowIntegrations>[0] = { microsoftTeams: TEAMS_CREDENTIALS }) =>
  buildWorkflowIntegrations({ now: () => NOW, ...options });

type TH = Awaited<ReturnType<typeof build>>;

const completeInput = (tenantId: string = randomUUID(), slug = `teams-${randomUUID().slice(0, 8)}`) => ({
  tenantId,
  slug,
  description: "Ops team",
  code: "consent-code",
  redirectUri: "https://app.infisical.test/callback"
});

const botRequest = (tenantId: string) => ({ body: { tenantId }, headers: {}, method: "POST", response: {} as never });

// A Teams integration whose tokens were stored earlier and expire the given time after the injected `now`.
const seedTeamsWithTokens = async (
  h: TH,
  orgId: string,
  tokens: { bot?: { value: string; expiresInMs: number }; graph?: { value: string; expiresInMs: number } },
  tenantId = randomUUID()
) => {
  const integration = microsoftTeamsIntegration({ orgId, tenantId });
  integration.markInstalled();
  if (tokens.bot) {
    const cipher = await h.encryptForOrg(orgId, tokens.bot.value);
    integration.changeMicrosoftTeamsInstallation((teams) =>
      teams.withToken(MicrosoftTeamsTokenKind.BotFramework, cipher, new Date(NOW.getTime() + tokens.bot!.expiresInMs))
    );
  }
  if (tokens.graph) {
    const cipher = await h.encryptForOrg(orgId, tokens.graph.value);
    integration.changeMicrosoftTeamsInstallation((teams) =>
      teams.withToken(MicrosoftTeamsTokenKind.Graph, cipher, new Date(NOW.getTime() + tokens.graph!.expiresInMs))
    );
  }
  return h.seed(integration);
};

const initializeBot = (h: TH) =>
  h.microsoftTeamsBot.initialize({ appId: TEAMS_CREDENTIALS.appId, clientSecret: TEAMS_CREDENTIALS.clientSecret });

describe("MicrosoftTeamsIntegrationService.getClientId", () => {
  test("should return the configured app id", async () => {
    // Setup
    const h = await build();
    const actor = await h.member();

    // Action
    const clientId = await h.module.microsoftTeamsIntegrationService.getClientId({ actor });

    // Assert
    expect(clientId).toBe(TEAMS_CREDENTIALS.appId);
  });

  test("should refuse when no app id is set", async () => {
    // Setup
    const h = await build({});
    const actor = await h.member();

    // Action
    const result = h.module.microsoftTeamsIntegrationService.getClientId({ actor });

    // Assert
    await expect(result).rejects.toBeInstanceOf(RuleViolationError);
    await expect(result).rejects.toThrow("Microsoft Teams app ID is not set");
  });
});

describe("MicrosoftTeamsIntegrationService.complete", () => {
  test("should refuse an actor who cannot create settings and store nothing", async () => {
    // Setup
    const h = await build();
    const actor = await h.member(OrgMembershipRole.Member);

    // Action
    const result = h.module.microsoftTeamsIntegrationService.complete({ actor, ...completeInput() });

    // Assert
    await expect(result).rejects.toBeInstanceOf(PermissionDeniedError);
    expect(await h.memory.workflowIntegrationStore.listByOrg(actor.org.id)).toEqual([]);
  });

  test("should refuse when the instance credentials are incomplete and store nothing", async () => {
    // Setup
    const h = await build({});
    await h.instanceConfigService.updateConfig({ microsoftTeamsAppId: "only-the-app-id" });
    const actor = await h.member();

    // Action
    const result = h.module.microsoftTeamsIntegrationService.complete({ actor, ...completeInput() });

    // Assert
    await expect(result).rejects.toThrow("Microsoft Teams app ID, client secret, or bot ID is not set");
    expect(await h.memory.workflowIntegrationStore.listByOrg(actor.org.id)).toEqual([]);
  });

  test("should refuse when admin consent is missing and store nothing", async () => {
    // Setup
    const h = await build();
    const actor = await h.member();
    const input = completeInput();
    h.microsoftTeamsClient.consentOutcomes.set(input.tenantId, { verified: false, reason: "consent-required" });

    // Action
    const result = h.module.microsoftTeamsIntegrationService.complete({ actor, ...input });

    // Assert
    await expect(result).rejects.toBeInstanceOf(RuleViolationError);
    await expect(result).rejects.toThrow("Unable to verify tenant, please ensure that you have granted admin consent.");
    expect(await h.memory.workflowIntegrationStore.listByOrg(actor.org.id)).toEqual([]);
  });

  test.each(["application", "authorization"] as const)(
    "should refuse when the %s token came from another tenant and store nothing",
    async (token) => {
      // Setup
      const h = await build();
      const actor = await h.member();
      const input = completeInput("tenant-expected");
      h.microsoftTeamsClient.consentOutcomes.set(input.tenantId, {
        verified: false,
        reason: "tenant-mismatch",
        token,
        issuedByTenantId: "tenant-actual"
      });

      // Action
      const result = h.module.microsoftTeamsIntegrationService.complete({ actor, ...input });

      // Assert
      await expect(result).rejects.toThrow(
        `Invalid ${token} token tenant ID. Expected tenant-expected, got tenant-actual`
      );
      expect(await h.memory.workflowIntegrationStore.listByOrg(actor.org.id)).toEqual([]);
    }
  );

  test("should store an installed integration with the internal app id and both tokens encrypted when the bot is in the tenant", async () => {
    // Setup
    const h = await build();
    const actor = await h.member();
    const input = completeInput();
    h.microsoftTeamsClient.tenants.set(input.tenantId, { installedAppId: "catalog-app-1" });

    // Action
    const created = await h.module.microsoftTeamsIntegrationService.complete({ actor, ...input });

    // Assert
    const stored = await h.memory.workflowIntegrationStore.findById(created.id);
    const teams = stored!.microsoftTeamsInstallation().toJSON();
    expect(stored).toMatchObject({
      orgId: actor.org.id,
      slug: input.slug,
      status: WorkflowIntegrationStatus.Installed
    });
    expect(teams).toMatchObject({ tenantId: input.tenantId, internalTeamsAppId: "catalog-app-1" });
    expect(await h.decryptForOrg(actor.org.id, teams.encryptedBotAccessToken!)).toMatch(/^bot-framework-token-/);
    expect(await h.decryptForOrg(actor.org.id, teams.encryptedAccessToken!)).toMatch(/^graph-token-/);
  });

  test("should store a pending integration when the bot is not in the tenant yet", async () => {
    // Setup
    const h = await build();
    const actor = await h.member();
    const input = completeInput();

    // Action
    const created = await h.module.microsoftTeamsIntegrationService.complete({ actor, ...input });

    // Assert
    const stored = await h.memory.workflowIntegrationStore.findById(created.id);
    expect(stored?.status).toBe(WorkflowIntegrationStatus.Pending);
    expect(stored?.microsoftTeamsInstallation().internalTeamsAppId).toBeNull();
  });
});

describe("MicrosoftTeamsIntegrationService.list", () => {
  test("should return the org's installed Teams integrations only", async () => {
    // Setup
    const h = await build();
    const actor = await h.member();
    const installed = microsoftTeamsIntegration({ orgId: actor.org.id });
    installed.markInstalled();
    await h.seed(installed);
    await h.seed(microsoftTeamsIntegration({ orgId: actor.org.id }));
    await h.seed(slackIntegration({ orgId: actor.org.id }));
    const otherOrg = microsoftTeamsIntegration({ orgId: randomUUID() });
    otherOrg.markInstalled();
    await h.seed(otherOrg);

    // Action
    const result = await h.module.microsoftTeamsIntegrationService.list({ actor });

    // Assert
    expect(result.map((integration) => integration.id)).toEqual([installed.id]);
  });

  test("should refuse an actor who cannot create settings", async () => {
    // Setup
    const h = await build();
    const actor = await h.member(OrgMembershipRole.Member);

    // Action
    const result = h.module.microsoftTeamsIntegrationService.list({ actor });

    // Assert
    await expect(result).rejects.toBeInstanceOf(PermissionDeniedError);
  });
});

describe("MicrosoftTeamsIntegrationService.checkInstallationStatus", () => {
  test("should flip an installed integration to pending and refuse when the bot is gone", async () => {
    // Setup
    const h = await build();
    const actor = await h.member();
    const integration = microsoftTeamsIntegration({ orgId: actor.org.id });
    integration.markInstalled();
    await h.seed(integration);

    // Action
    const result = h.module.microsoftTeamsIntegrationService.checkInstallationStatus({ actor, id: integration.id });

    // Assert
    await expect(result).rejects.toBeInstanceOf(RuleViolationError);
    await expect(result).rejects.toThrow(
      "Microsoft Teams bot is not installed in the configured Microsoft Teams Tenant"
    );
    const stored = await h.memory.workflowIntegrationStore.findById(integration.id);
    expect(stored?.status).toBe(WorkflowIntegrationStatus.Pending);
  });

  test("should flip a pending integration to installed when the bot is in the tenant", async () => {
    // Setup
    const h = await build();
    const actor = await h.member();
    const integration = await h.seed(microsoftTeamsIntegration({ orgId: actor.org.id }));
    h.microsoftTeamsClient.tenants.set(integration.microsoftTeamsInstallation().tenantId, {
      installedAppId: "catalog-app-1"
    });

    // Action
    const result = await h.module.microsoftTeamsIntegrationService.checkInstallationStatus({
      actor,
      id: integration.id
    });

    // Assert
    const stored = await h.memory.workflowIntegrationStore.findById(integration.id);
    expect(result.status).toBe(WorkflowIntegrationStatus.Installed);
    expect(stored?.status).toBe(WorkflowIntegrationStatus.Installed);
  });

  test("should refuse an actor who cannot edit settings and leave the status as it was", async () => {
    // Setup
    const h = await build();
    const actor = await h.member(OrgMembershipRole.Member);
    const integration = await h.seed(microsoftTeamsIntegration({ orgId: actor.org.id }));
    h.microsoftTeamsClient.tenants.set(integration.microsoftTeamsInstallation().tenantId, {
      installedAppId: "catalog-app-1"
    });

    // Action
    const result = h.module.microsoftTeamsIntegrationService.checkInstallationStatus({ actor, id: integration.id });

    // Assert
    await expect(result).rejects.toBeInstanceOf(PermissionDeniedError);
    expect((await h.memory.workflowIntegrationStore.findById(integration.id))?.status).toBe(
      WorkflowIntegrationStatus.Pending
    );
  });

  test("should report a Slack integration's id as not found", async () => {
    // Setup
    const h = await build();
    const actor = await h.member();
    const slack = await h.seed(slackIntegration({ orgId: actor.org.id }));

    // Action
    const result = h.module.microsoftTeamsIntegrationService.checkInstallationStatus({ actor, id: slack.id });

    // Assert
    await expect(result).rejects.toBeInstanceOf(EntityNotFoundError);
    await expect(result).rejects.toThrow(`Microsoft Teams integration with ID ${slack.id} not found`);
  });
});

describe("MicrosoftTeamsIntegrationService.getTeams", () => {
  test("should refuse while the bot is uninitialized", async () => {
    // Setup
    const h = await build();
    const actor = await h.member();
    const integration = await h.seed(microsoftTeamsIntegration({ orgId: actor.org.id }));

    // Action
    const result = h.module.microsoftTeamsIntegrationService.getTeams({ actor, id: integration.id });

    // Assert
    await expect(result).rejects.toBeInstanceOf(RuleViolationError);
    await expect(result).rejects.toThrow(
      "Unable to get teams and channels because the Microsoft Teams bot is uninitialized"
    );
  });

  test("should refuse when the bot is not installed in the tenant", async () => {
    // Setup
    const h = await build();
    initializeBot(h);
    const actor = await h.member();
    const integration = await h.seed(microsoftTeamsIntegration({ orgId: actor.org.id }));

    // Action
    const result = h.module.microsoftTeamsIntegrationService.getTeams({ actor, id: integration.id });

    // Assert
    await expect(result).rejects.toThrow(
      "Microsoft Teams bot is not installed in the configured Microsoft Teams Tenant"
    );
  });

  test("should return the teams of the tenant when the bot is installed", async () => {
    // Setup
    const h = await build();
    initializeBot(h);
    const actor = await h.member();
    const integration = await h.seed(microsoftTeamsIntegration({ orgId: actor.org.id }));
    const { tenantId } = integration.microsoftTeamsInstallation();
    const teams = [{ teamId: "team-1", teamName: "Ops", channels: [{ channelId: "ch-1", channelName: "alerts" }] }];
    h.microsoftTeamsClient.tenants.set(tenantId, { installedAppId: "catalog-app-1" });
    h.microsoftTeamsClient.teamsByTenant.set(tenantId, teams);

    // Action
    const result = await h.module.microsoftTeamsIntegrationService.getTeams({ actor, id: integration.id });

    // Assert
    expect(result.teams).toEqual(teams);
    expect(result.integration.id).toBe(integration.id);
  });
});

describe("MicrosoftTeamsIntegrationService.handleBotMessage", () => {
  test("should mark a pending integration of the tenant installed", async () => {
    // Setup
    const h = await build();
    initializeBot(h);
    const orgId = randomUUID();
    const integration = await h.seed(microsoftTeamsIntegration({ orgId, tenantId: "tenant-1" }));
    const otherTenant = await h.seed(microsoftTeamsIntegration({ orgId, tenantId: "tenant-2" }));

    // Action
    await h.module.microsoftTeamsIntegrationService.handleBotMessage(botRequest("tenant-1"));

    // Assert
    const stored = await h.memory.workflowIntegrationStore.findById(integration.id);
    const untouched = await h.memory.workflowIntegrationStore.findById(otherTenant.id);
    expect(stored?.status).toBe(WorkflowIntegrationStatus.Installed);
    expect(untouched?.status).toBe(WorkflowIntegrationStatus.Pending);
  });

  test("should install every org's pending integration of the tenant when an older one is already installed", async () => {
    // Setup
    const h = await build();
    initializeBot(h);
    const installed = microsoftTeamsIntegration({ orgId: randomUUID(), tenantId: "tenant-1" });
    installed.markInstalled();
    await h.seed(installed);
    const pending = await h.seed(microsoftTeamsIntegration({ orgId: randomUUID(), tenantId: "tenant-1" }));

    // Action
    await h.module.microsoftTeamsIntegrationService.handleBotMessage(botRequest("tenant-1"));

    // Assert
    const stored = await h.memory.workflowIntegrationStore.findById(pending.id);
    expect(stored?.status).toBe(WorkflowIntegrationStatus.Installed);
  });

  test("should leave an installed integration of the tenant as it was", async () => {
    // Setup
    const h = await build();
    initializeBot(h);
    const integration = microsoftTeamsIntegration({ orgId: randomUUID(), tenantId: "tenant-1" });
    integration.markInstalled();
    await h.seed(integration);

    // Action
    await h.module.microsoftTeamsIntegrationService.handleBotMessage(botRequest("tenant-1"));

    // Assert
    const stored = await h.memory.workflowIntegrationStore.findById(integration.id);
    expect(stored?.toJSON()).toEqual(integration.toJSON());
  });

  test("should do nothing for a tenant with no integration", async () => {
    // Setup
    const h = await build();
    initializeBot(h);
    const integration = await h.seed(microsoftTeamsIntegration({ orgId: randomUUID(), tenantId: "tenant-1" }));

    // Action
    await h.module.microsoftTeamsIntegrationService.handleBotMessage(botRequest("unknown-tenant"));

    // Assert
    const stored = await h.memory.workflowIntegrationStore.findById(integration.id);
    expect(stored?.status).toBe(WorkflowIntegrationStatus.Pending);
  });
});

describe("MicrosoftTeamsIntegrationService tokens", () => {
  test("should reuse stored tokens with more than five minutes left and issue none", async () => {
    // Setup
    const h = await build();
    initializeBot(h);
    const actor = await h.member();
    const tenantId = randomUUID();
    const integration = await seedTeamsWithTokens(
      h,
      actor.org.id,
      {
        bot: { value: `bot-token-${tenantId}-9`, expiresInMs: 6 * MINUTE },
        graph: { value: `graph-token-${tenantId}-9`, expiresInMs: 6 * MINUTE }
      },
      tenantId
    );
    h.microsoftTeamsClient.tenants.set(tenantId, { installedAppId: "catalog-app-1" });

    // Action
    const result = await h.module.microsoftTeamsIntegrationService.getTeams({ actor, id: integration.id });

    // Assert
    expect(result.teams).toEqual([]);
    expect(h.microsoftTeamsClient.issued).toEqual([]);
  });

  test("should issue a new token when the stored one is within five minutes of expiry and save it encrypted", async () => {
    // Setup
    const h = await build();
    initializeBot(h);
    const actor = await h.member();
    const tenantId = randomUUID();
    const integration = await seedTeamsWithTokens(
      h,
      actor.org.id,
      {
        bot: { value: `bot-framework-token-${tenantId}-9`, expiresInMs: 4 * MINUTE },
        graph: { value: `graph-token-${tenantId}-9`, expiresInMs: 6 * MINUTE }
      },
      tenantId
    );
    h.microsoftTeamsClient.tenants.set(tenantId, { installedAppId: "catalog-app-1" });

    // Action
    await h.module.microsoftTeamsIntegrationService.getTeams({ actor, id: integration.id });

    // Assert
    const stored = await h.memory.workflowIntegrationStore.findById(integration.id);
    const saved = stored!.microsoftTeamsInstallation().toJSON().encryptedBotAccessToken!;
    expect(h.microsoftTeamsClient.issued).toEqual([{ tenantId, kind: MicrosoftTeamsTokenKind.BotFramework }]);
    expect(await h.decryptForOrg(actor.org.id, saved)).toBe(`bot-framework-token-${tenantId}-1`);
  });

  test("should save a refreshed token without reverting a rename made while Microsoft was being called", async () => {
    // Setup
    const h = await build();
    initializeBot(h);
    const actor = await h.member();
    const integration = await h.seed(microsoftTeamsIntegration({ orgId: actor.org.id, slug: "before" }));
    const { tenantId } = integration.microsoftTeamsInstallation();
    h.microsoftTeamsClient.tenants.set(tenantId, { installedAppId: "catalog-app-1" });
    const { issueToken } = h.microsoftTeamsClient;
    h.microsoftTeamsClient.issueToken = async (input) => {
      const current = (await h.memory.workflowIntegrationStore.findById(integration.id)) as WorkflowIntegration;
      current.rename({ slug: "renamed", description: "edited meanwhile" });
      await h.memory.workflowIntegrationStore.save(current);
      return issueToken(input);
    };

    // Action
    await h.module.microsoftTeamsIntegrationService.getTeams({ actor, id: integration.id });

    // Assert
    const stored = await h.memory.workflowIntegrationStore.findById(integration.id);
    expect([stored?.slug, stored?.description]).toEqual(["renamed", "edited meanwhile"]);
    expect(stored?.microsoftTeamsInstallation().toJSON().encryptedBotAccessToken).not.toBeNull();
  });
});

describe("MicrosoftTeamsIntegrationService.start", () => {
  test("should initialize the bot with the instance credentials when they are complete", async () => {
    // Setup
    const h = await build();

    // Action
    await h.module.start();

    // Assert
    expect(h.microsoftTeamsBot.initializations).toEqual([
      { appId: TEAMS_CREDENTIALS.appId, clientSecret: TEAMS_CREDENTIALS.clientSecret }
    ]);
  });

  test("should leave the bot uninitialized when the credentials are incomplete", async () => {
    // Setup
    const h = await build({});
    await h.instanceConfigService.updateConfig({ microsoftTeamsAppId: "only-the-app-id" });

    // Action
    await h.module.start();

    // Assert
    expect(h.microsoftTeamsBot.isInitialized()).toBe(false);
  });
});

describe("MicrosoftTeamsIntegrationService.syncBotWithConfig / reinitializeBot", () => {
  test("should rebuild the bot once after the config changed and not again while it is unchanged", async () => {
    // Setup
    const h = await build();
    const service = h.module.microsoftTeamsIntegrationService;
    service.reinitializeBot({ ...TEAMS_CREDENTIALS, configUpdatedAt: new Date(0) });

    // Action
    await service.syncBotWithConfig();
    await service.syncBotWithConfig();

    // Assert
    expect(h.microsoftTeamsBot.initializations).toHaveLength(2);
  });

  test("should do nothing after reinitializeBot recorded the current config time", async () => {
    // Setup
    const h = await build();
    const service = h.module.microsoftTeamsIntegrationService;
    const { configUpdatedAt } = await h.instanceConfigService.getMicrosoftTeamsCredentials();
    service.reinitializeBot({ appId: "new-app", clientSecret: "new-secret", configUpdatedAt });

    // Action
    await service.syncBotWithConfig();

    // Assert
    expect(h.microsoftTeamsBot.initializations).toEqual([{ appId: "new-app", clientSecret: "new-secret" }]);
  });
});
