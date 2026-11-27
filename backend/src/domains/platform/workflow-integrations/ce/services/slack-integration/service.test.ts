import { randomUUID } from "node:crypto";

import { OrgMembershipRole } from "@app/db/schemas";
import { EntityNotFoundError, PermissionDeniedError, RuleViolationError } from "@app/domains/lib/errors";
import { OrgPermissionActions, OrgPermissionSubjects } from "@app/domains/platform/organizations/ce/module";

import { WorkflowIntegrationProvider, WorkflowIntegrationStatus } from "../../models/enums";
import { SlackInstallation } from "../../models/slack-installation";
import { buildWorkflowIntegrations, SITE_URL } from "../../testing/build-workflow-integrations";
import {
  microsoftTeamsIntegration,
  slackInstallation,
  slackIntegration
} from "../../testing/workflow-integration-fixture";

const SLACK = { clientId: "slack-client", clientSecret: "slack-secret" };

const settingsRule = (action: OrgPermissionActions) => ({ action, subject: OrgPermissionSubjects.Settings }) as const;

const build = (options: Parameters<typeof buildWorkflowIntegrations>[0] = { slack: SLACK }) =>
  buildWorkflowIntegrations(options);

type TH = Awaited<ReturnType<typeof build>>;

const seedSlackWithToken = async (h: TH, orgId: string, token: string, slug?: string) => {
  const encryptedBotAccessToken = await h.encryptForOrg(orgId, token);
  return h.seed(
    slackIntegration({
      orgId,
      slug,
      installation: SlackInstallation.restore({ ...slackInstallation().toJSON(), encryptedBotAccessToken })
    })
  );
};

const runCallback = async (h: TH) => {
  const outcome: { result?: "success" | "failure"; orgId?: string } = {};
  await h.module.slackIntegrationService.handleOAuthCallback({
    request: {} as never,
    response: {} as never,
    onSuccess: async (orgId) => {
      outcome.result = "success";
      outcome.orgId = orgId;
    },
    onFailure: async () => {
      outcome.result = "failure";
    }
  });
  return outcome;
};

describe("SlackIntegrationService.getInstallUrl", () => {
  test("should carry the slug, description and org in the metadata and redirect to the Slack OAuth route", async () => {
    // Setup
    const h = await build();
    const actor = await h.member();

    // Action
    const url = new URL(
      await h.module.slackIntegrationService.getInstallUrl({ actor, slug: "alerts", description: "Alert channel" })
    );

    // Assert
    expect(JSON.parse(url.searchParams.get("metadata") as string)).toEqual({
      slug: "alerts",
      description: "Alert channel",
      orgId: actor.org.id
    });
    expect(url.searchParams.get("redirect_uri")).toBe(`${SITE_URL}/api/v1/workflow-integrations/slack/oauth_redirect`);
    expect(url.searchParams.get("client_id")).toBe(SLACK.clientId);
  });

  test("should refuse an actor who cannot create settings", async () => {
    // Setup
    const h = await build();
    const actor = await h.member(OrgMembershipRole.Member);

    // Action
    const result = h.module.slackIntegrationService.getInstallUrl({ actor, slug: "alerts" });

    // Assert
    await expect(result).rejects.toBeInstanceOf(PermissionDeniedError);
  });

  test("should tell a self-hosted admin to set the Slack credentials when they are missing", async () => {
    // Setup
    const h = await build({ isCloud: false });
    const actor = await h.member();

    // Action
    const result = h.module.slackIntegrationService.getInstallUrl({ actor, slug: "alerts" });

    // Assert
    await expect(result).rejects.toBeInstanceOf(RuleViolationError);
    await expect(result).rejects.toThrow(
      "Invalid Slack configuration. Contact your instance admin to setup Slack integration in the Admin settings. Your configuration is missing Slack client ID and secret."
    );
  });

  test("should tell a cloud user to contact Infisical when the Slack credentials are missing", async () => {
    // Setup
    const h = await build({ isCloud: true });
    const actor = await h.member();

    // Action
    const result = h.module.slackIntegrationService.getInstallUrl({ actor, slug: "alerts" });

    // Assert
    await expect(result).rejects.toThrow("Invalid Slack configuration. Please contact the Infisical team.");
  });
});

describe("SlackIntegrationService.handleOAuthCallback", () => {
  test("should create an installed integration in the metadata's org with the bot token encrypted for that org", async () => {
    // Setup
    const h = await build();
    const orgId = randomUUID();
    h.slackClient.nextInstall = {
      metadata: JSON.stringify({ slug: "alerts", description: "Alert channel", orgId }),
      teamId: "T-acme",
      botAccessToken: "xoxb-secret"
    };

    // Action
    const outcome = await runCallback(h);

    // Assert
    const [created] = await h.memory.workflowIntegrationStore.listByOrg(orgId);
    expect(outcome).toEqual({ result: "success", orgId });
    expect(created).toMatchObject({
      slug: "alerts",
      description: "Alert channel",
      status: WorkflowIntegrationStatus.Installed
    });
    expect(created.slackInstallation().teamId).toBe("T-acme");
    expect(await h.decryptForOrg(orgId, created.slackInstallation().encryptedBotAccessToken)).toBe("xoxb-secret");
  });

  test("should keep the id and slug and replace the token on a reinstall", async () => {
    // Setup
    const h = await build();
    const orgId = randomUUID();
    const existing = await seedSlackWithToken(h, orgId, "xoxb-old", "alerts");
    h.slackClient.nextInstall = { metadata: JSON.stringify({ id: existing.id, orgId }), botAccessToken: "xoxb-new" };

    // Action
    const outcome = await runCallback(h);

    // Assert
    const all = await h.memory.workflowIntegrationStore.listByOrg(orgId);
    expect(outcome).toEqual({ result: "success", orgId });
    expect(all.map((integration) => [integration.id, integration.slug])).toEqual([[existing.id, "alerts"]]);
    expect(await h.decryptForOrg(orgId, all[0].slackInstallation().encryptedBotAccessToken)).toBe("xoxb-new");
  });

  test("should fail an enterprise install and store nothing", async () => {
    // Setup
    const h = await build();
    const orgId = randomUUID();
    h.slackClient.nextInstall = { isEnterpriseInstall: true, metadata: JSON.stringify({ slug: "alerts", orgId }) };

    // Action
    const outcome = await runCallback(h);

    // Assert
    expect(outcome.result).toBe("failure");
    expect(await h.memory.workflowIntegrationStore.listByOrg(orgId)).toEqual([]);
  });

  test("should fail a reinstall of another org's integration and leave it unchanged", async () => {
    // Setup
    const h = await build();
    const otherOrgId = randomUUID();
    const theirs = await seedSlackWithToken(h, otherOrgId, "xoxb-theirs");
    h.slackClient.nextInstall = {
      metadata: JSON.stringify({ id: theirs.id, orgId: randomUUID() }),
      botAccessToken: "xoxb-attacker"
    };

    // Action
    const outcome = await runCallback(h);

    // Assert
    const stored = await h.memory.workflowIntegrationStore.findById(theirs.id);
    expect(outcome.result).toBe("failure");
    expect(stored?.toJSON()).toEqual(theirs.toJSON());
  });

  test("should fail a reinstall of a Microsoft Teams integration and leave it unchanged", async () => {
    // Setup
    const h = await build();
    const orgId = randomUUID();
    const teams = await h.seed(microsoftTeamsIntegration({ orgId }));
    h.slackClient.nextInstall = { metadata: JSON.stringify({ id: teams.id, orgId }) };

    // Action
    const outcome = await runCallback(h);

    // Assert
    const stored = await h.memory.workflowIntegrationStore.findById(teams.id);
    expect(outcome.result).toBe("failure");
    expect(stored?.toJSON()).toEqual(teams.toJSON());
  });
});

describe("SlackIntegrationService.getReinstallUrl", () => {
  test("should carry the id and the integration's org in the metadata", async () => {
    // Setup
    const h = await build();
    const actor = await h.member();
    const integration = await h.seed(slackIntegration({ orgId: actor.org.id }));

    // Action
    const url = new URL(await h.module.slackIntegrationService.getReinstallUrl({ actor, id: integration.id }));

    // Assert
    expect(JSON.parse(url.searchParams.get("metadata") as string)).toEqual({ id: integration.id, orgId: actor.org.id });
  });

  test("should refuse an actor who cannot create settings", async () => {
    // Setup
    const h = await build();
    const actor = await h.member(OrgMembershipRole.Member);
    const integration = await h.seed(slackIntegration({ orgId: actor.org.id }));

    // Action
    const result = h.module.slackIntegrationService.getReinstallUrl({ actor, id: integration.id });

    // Assert
    await expect(result).rejects.toBeInstanceOf(PermissionDeniedError);
  });
});

describe("SlackIntegrationService.list", () => {
  test("should return only this org's Slack integrations", async () => {
    // Setup
    const h = await build();
    const actor = await h.member();
    const mine = await h.seed(slackIntegration({ orgId: actor.org.id }));
    await h.seed(microsoftTeamsIntegration({ orgId: actor.org.id }));
    await h.seed(slackIntegration({ orgId: randomUUID() }));

    // Action
    const result = await h.module.slackIntegrationService.list({ actor });

    // Assert
    expect(result.map((integration) => integration.id)).toEqual([mine.id]);
    expect(result[0].provider).toBe(WorkflowIntegrationProvider.Slack);
  });

  test("should refuse an actor who cannot create settings", async () => {
    // Setup
    const h = await build();
    const actor = await h.member(OrgMembershipRole.Member);

    // Action
    const result = h.module.slackIntegrationService.list({ actor });

    // Assert
    await expect(result).rejects.toBeInstanceOf(PermissionDeniedError);
  });
});

describe("SlackIntegrationService.getById / assertCanRead / listChannels / update / delete", () => {
  const unknownIdCases = [
    ["getById", "Slack integration not found."],
    ["assertCanRead", undefined],
    ["listChannels", undefined],
    ["update", undefined],
    ["delete", undefined]
  ] as const;

  test.each(unknownIdCases)("should report %s of an unknown id as not found", async (method, message) => {
    // Setup
    const h = await build();
    const actor = await h.member();
    const id = randomUUID();

    // Action
    const result = h.module.slackIntegrationService[method]({ actor, id });

    // Assert
    await expect(result).rejects.toBeInstanceOf(EntityNotFoundError);
    await expect(result).rejects.toThrow(message ?? `Slack integration with ID ${id} not found`);
  });

  test.each(unknownIdCases)("should report %s of a Microsoft Teams id as not found", async (method, message) => {
    // Setup
    const h = await build();
    const actor = await h.member();
    const teams = await h.seed(microsoftTeamsIntegration({ orgId: actor.org.id }));

    // Action
    const result = h.module.slackIntegrationService[method]({ actor, id: teams.id });

    // Assert
    await expect(result).rejects.toBeInstanceOf(EntityNotFoundError);
    await expect(result).rejects.toThrow(message ?? `Slack integration with ID ${teams.id} not found`);
  });

  test.each(unknownIdCases)("should refuse %s of another org's integration", async (method) => {
    // Setup
    const h = await build();
    const actor = await h.member();
    const theirs = await seedSlackWithToken(h, randomUUID(), "xoxb-theirs");

    // Action
    const result = h.module.slackIntegrationService[method]({ actor, id: theirs.id });

    // Assert
    await expect(result).rejects.toBeInstanceOf(PermissionDeniedError);
    expect((await h.memory.workflowIntegrationStore.findById(theirs.id))?.toJSON()).toEqual(theirs.toJSON());
  });

  test.each([
    ["getById", OrgPermissionActions.Read],
    ["assertCanRead", OrgPermissionActions.Read],
    ["listChannels", OrgPermissionActions.Read],
    ["update", OrgPermissionActions.Edit],
    ["delete", OrgPermissionActions.Delete]
  ] as const)("should require %s to hold only the %s action on settings", async (method, action) => {
    // Setup
    const h = await build();
    const orgId = randomUUID();
    const integration = await seedSlackWithToken(h, orgId, "xoxb-1");
    const allowed = await h.memberWithRules([settingsRule(action)], orgId);
    const denied = await h.memberWithRules([], orgId);

    // Action
    const refused = h.module.slackIntegrationService[method]({ actor: denied, id: integration.id });
    const accepted = h.module.slackIntegrationService[method]({ actor: allowed, id: integration.id });

    // Assert
    await expect(refused).rejects.toBeInstanceOf(PermissionDeniedError);
    await expect(accepted).resolves.toBeDefined();
  });

  test("should refuse update and delete to a member who can only read and change nothing", async () => {
    // Setup
    const h = await build();
    const actor = await h.member(OrgMembershipRole.Member);
    const integration = await h.seed(slackIntegration({ orgId: actor.org.id, slug: "alerts" }));

    // Action
    const update = h.module.slackIntegrationService.update({ actor, id: integration.id, slug: "renamed" });
    const remove = h.module.slackIntegrationService.delete({ actor, id: integration.id });

    // Assert
    await expect(update).rejects.toBeInstanceOf(PermissionDeniedError);
    await expect(remove).rejects.toBeInstanceOf(PermissionDeniedError);
    expect((await h.memory.workflowIntegrationStore.findById(integration.id))?.toJSON()).toEqual(integration.toJSON());
  });
});

describe("SlackIntegrationService.listChannels", () => {
  test("should return the channels the fake holds for the decrypted bot token", async () => {
    // Setup
    const h = await build();
    const actor = await h.member();
    const integration = await seedSlackWithToken(h, actor.org.id, "xoxb-mine");
    const channels = [{ id: "C1", name: "alerts", isArchived: false }];
    h.slackClient.setChannels("xoxb-mine", channels);
    h.slackClient.setChannels("xoxb-other", [{ id: "C2", name: "other", isArchived: false }]);

    // Action
    const result = await h.module.slackIntegrationService.listChannels({ actor, id: integration.id });

    // Assert
    expect(result).toEqual(channels);
  });
});

describe("SlackIntegrationService.update", () => {
  test("should rename the integration and keep the fields left undefined", async () => {
    // Setup
    const h = await build();
    const actor = await h.member();
    const integration = await h.seed(slackIntegration({ orgId: actor.org.id, slug: "alerts", description: "old" }));

    // Action
    const result = await h.module.slackIntegrationService.update({ actor, id: integration.id, slug: "ops" });

    // Assert
    const stored = await h.memory.workflowIntegrationStore.findById(integration.id);
    expect([result.slug, result.description]).toEqual(["ops", "old"]);
    expect([stored?.slug, stored?.description]).toEqual(["ops", "old"]);
  });
});

describe("SlackIntegrationService.delete", () => {
  test("should remove the integration and return it as it was", async () => {
    // Setup
    const h = await build();
    const actor = await h.member();
    const integration = await h.seed(slackIntegration({ orgId: actor.org.id }));
    const before = integration.toJSON();

    // Action
    const result = await h.module.slackIntegrationService.delete({ actor, id: integration.id });

    // Assert
    expect(result.toJSON()).toEqual(before);
    expect(await h.memory.workflowIntegrationStore.findById(integration.id)).toBeNull();
  });
});
