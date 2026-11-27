import { randomUUID } from "node:crypto";

import { PermissionDeniedError } from "@app/domains/lib/errors";

import { WorkflowIntegrationProvider, WorkflowIntegrationStatus } from "../../models/enums";
import { buildWorkflowIntegrations } from "../../testing/build-workflow-integrations";
import { microsoftTeamsIntegration, slackIntegration } from "../../testing/workflow-integration-fixture";

describe("WorkflowIntegrationService.listByOrg", () => {
  test("should return every provider and status of the actor's org and nothing from another org", async () => {
    // Setup
    const h = await buildWorkflowIntegrations();
    const actor = await h.member();
    const slack = await h.seed(slackIntegration({ orgId: actor.org.id }));
    const pendingTeams = await h.seed(microsoftTeamsIntegration({ orgId: actor.org.id }));
    const installedTeams = microsoftTeamsIntegration({ orgId: actor.org.id });
    installedTeams.markInstalled();
    await h.seed(installedTeams);
    await h.seed(slackIntegration({ orgId: randomUUID() }));

    // Action
    const result = await h.module.workflowIntegrationService.listByOrg({ actor });

    // Assert
    expect(result.map((integration) => integration.id)).toEqual([slack.id, pendingTeams.id, installedTeams.id]);
    expect(result.map((integration) => [integration.provider, integration.status])).toEqual([
      [WorkflowIntegrationProvider.Slack, WorkflowIntegrationStatus.Installed],
      [WorkflowIntegrationProvider.MicrosoftTeams, WorkflowIntegrationStatus.Pending],
      [WorkflowIntegrationProvider.MicrosoftTeams, WorkflowIntegrationStatus.Installed]
    ]);
  });

  test("should refuse an actor who cannot read the org's settings", async () => {
    // Setup
    const h = await buildWorkflowIntegrations();
    const actor = await h.memberWithRules([]);
    await h.seed(slackIntegration({ orgId: actor.org.id }));

    // Action
    const result = h.module.workflowIntegrationService.listByOrg({ actor });

    // Assert
    await expect(result).rejects.toBeInstanceOf(PermissionDeniedError);
  });
});

describe("WorkflowIntegrationService.findInOrg", () => {
  test("should return the integration of the org", async () => {
    // Setup
    const h = await buildWorkflowIntegrations();
    const orgId = randomUUID();
    const integration = await h.seed(slackIntegration({ orgId }));

    // Action
    const found = await h.module.workflowIntegrationService.findInOrg({ orgId, id: integration.id });

    // Assert
    expect(found?.toJSON()).toEqual(integration.toJSON());
  });

  test("should return null for an integration of another org", async () => {
    // Setup
    const h = await buildWorkflowIntegrations();
    const integration = await h.seed(slackIntegration({ orgId: randomUUID() }));

    // Action
    const found = await h.module.workflowIntegrationService.findInOrg({ orgId: randomUUID(), id: integration.id });

    // Assert
    expect(found).toBeNull();
  });

  test("should return null when the integration is of another provider than the one asked for", async () => {
    // Setup
    const h = await buildWorkflowIntegrations();
    const orgId = randomUUID();
    const integration = await h.seed(slackIntegration({ orgId }));

    // Action
    const found = await h.module.workflowIntegrationService.findInOrg({
      orgId,
      id: integration.id,
      provider: WorkflowIntegrationProvider.MicrosoftTeams
    });

    // Assert
    expect(found).toBeNull();
  });

  test("should return null for an unknown id", async () => {
    // Setup
    const h = await buildWorkflowIntegrations();

    // Action
    const found = await h.module.workflowIntegrationService.findInOrg({ orgId: randomUUID(), id: randomUUID() });

    // Assert
    expect(found).toBeNull();
  });
});

describe("WorkflowIntegrationService.listInOrg", () => {
  test("should return the org's integrations among the ids and drop other orgs' and unknown ids", async () => {
    // Setup
    const h = await buildWorkflowIntegrations();
    const orgId = randomUUID();
    const mine = await h.seed(slackIntegration({ orgId }));
    const myTeams = await h.seed(microsoftTeamsIntegration({ orgId }));
    const theirs = await h.seed(slackIntegration({ orgId: randomUUID() }));

    // Action
    const result = await h.module.workflowIntegrationService.listInOrg({
      orgId,
      ids: [mine.id, myTeams.id, theirs.id, randomUUID()]
    });

    // Assert
    expect(result.map((integration) => integration.id).sort()).toEqual([mine.id, myTeams.id].sort());
  });

  test("should return nothing for no ids", async () => {
    // Setup
    const h = await buildWorkflowIntegrations();
    const orgId = randomUUID();
    await h.seed(slackIntegration({ orgId }));

    // Action
    const result = await h.module.workflowIntegrationService.listInOrg({ orgId, ids: [] });

    // Assert
    expect(result).toEqual([]);
  });
});
