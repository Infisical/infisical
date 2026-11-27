import { randomUUID } from "node:crypto";

import { ProjectMembershipRole } from "@app/db/schemas";
import { EntityNotFoundError, PermissionDeniedError, RuleViolationError } from "@app/domains/lib/errors";
import { WorkflowIntegrationProvider } from "@app/domains/platform/workflow-integrations/ce/module";
import {
  microsoftTeamsIntegration,
  slackIntegration
} from "@app/domains/platform/workflow-integrations/ce/testing/workflow-integration-fixture";

import { buildProjectChatConfig } from "../../testing/build-project-chat-config";

const { Slack, MicrosoftTeams } = WorkflowIntegrationProvider;

const slackSettings = (integrationId: string) => ({
  integrationId,
  isAccessRequestNotificationEnabled: true,
  accessRequestChannels: "C1, C2",
  isSecretRequestNotificationEnabled: false,
  secretRequestChannels: "C3",
  isSecretSyncErrorNotificationEnabled: true,
  secretSyncErrorChannels: "C4"
});

const teamsSettings = (integrationId: string) => ({
  integrationId,
  isAccessRequestNotificationEnabled: true,
  accessRequestChannels: { teamId: "team-1", channelIds: ["c1"] },
  isSecretRequestNotificationEnabled: false,
  secretRequestChannels: { teamId: "team-1", channelIds: ["c2"] }
});

const build = () => {
  const t = buildProjectChatConfig();
  const addSlack = () => {
    const integration = slackIntegration({ orgId: t.orgId });
    t.workflowIntegrationService.add(integration);
    return integration.id;
  };
  const addTeams = ({ installed = true }: { installed?: boolean } = {}) => {
    const integration = microsoftTeamsIntegration({ orgId: t.orgId });
    if (installed) integration.markInstalled();
    t.workflowIntegrationService.add(integration);
    return integration.id;
  };
  return { ...t, addSlack, addTeams };
};

describe("ProjectChatConfigService.update", () => {
  test("should create the Slack settings on the first save and update the same row on the next", async () => {
    // Setup
    const t = build();
    const actor = await t.member();
    const integrationId = t.addSlack();
    const otherIntegrationId = t.addSlack();
    const first = await t.projectChatConfigService.update({
      actor,
      projectId: t.projectId,
      provider: Slack,
      settings: slackSettings(integrationId)
    });

    // Action
    const second = await t.projectChatConfigService.update({
      actor,
      projectId: t.projectId,
      provider: Slack,
      settings: { ...slackSettings(otherIntegrationId), accessRequestChannels: "C9" }
    });

    // Assert
    expect(second.config.toJSON()).toMatchObject({
      id: first.config.toJSON().id,
      integrationId: otherIntegrationId,
      accessRequestChannels: "C9"
    });
    expect((await t.memory.slackProjectChatConfigStore.findByProjectId(t.projectId))?.toJSON()).toEqual(
      second.config.toJSON()
    );
  });

  test("should create the Teams settings on the first save and update the same row on the next", async () => {
    // Setup
    const t = build();
    const actor = await t.member();
    const integrationId = t.addTeams();
    const first = await t.projectChatConfigService.update({
      actor,
      projectId: t.projectId,
      provider: MicrosoftTeams,
      settings: teamsSettings(integrationId)
    });

    // Action
    const second = await t.projectChatConfigService.update({
      actor,
      projectId: t.projectId,
      provider: MicrosoftTeams,
      settings: { ...teamsSettings(integrationId), isSecretRequestNotificationEnabled: true }
    });

    // Assert
    expect(second.config.toJSON()).toMatchObject({
      id: first.config.toJSON().id,
      isSecretRequestNotificationEnabled: true
    });
  });

  test("should refuse an actor who cannot edit project settings and store nothing", async () => {
    // Setup
    const t = build();
    const actor = await t.member(ProjectMembershipRole.Viewer);
    const integrationId = t.addSlack();

    // Action
    const result = t.projectChatConfigService.update({
      actor,
      projectId: t.projectId,
      provider: Slack,
      settings: slackSettings(integrationId)
    });

    // Assert
    await expect(result).rejects.toBeInstanceOf(PermissionDeniedError);
    expect(await t.memory.slackProjectChatConfigStore.findByProjectId(t.projectId)).toBeNull();
  });

  test("should refuse a project that does not exist", async () => {
    // Setup
    const t = build();
    const actor = await t.member();
    const projectId = randomUUID();

    // Action
    const result = t.projectChatConfigService.update({
      actor,
      projectId,
      provider: Slack,
      settings: slackSettings(t.addSlack())
    });

    // Assert
    await expect(result).rejects.toBeInstanceOf(EntityNotFoundError);
    await expect(result).rejects.toThrow(`Project with ID '${projectId}' not found`);
  });

  test("should refuse a Slack integration that does not exist and store nothing", async () => {
    // Setup
    const t = build();
    const actor = await t.member();
    const integrationId = randomUUID();

    // Action
    const result = t.projectChatConfigService.update({
      actor,
      projectId: t.projectId,
      provider: Slack,
      settings: slackSettings(integrationId)
    });

    // Assert
    await expect(result).rejects.toBeInstanceOf(EntityNotFoundError);
    await expect(result).rejects.toThrow(`Slack integration with ID '${integrationId}' not found`);
    expect(await t.memory.slackProjectChatConfigStore.findByProjectId(t.projectId)).toBeNull();
  });

  test("should refuse another org's Slack integration as not in the same organization and store nothing", async () => {
    // Setup
    const t = build();
    const actor = await t.member();
    const foreign = slackIntegration({ orgId: randomUUID() });
    t.workflowIntegrationService.add(foreign);

    // Action
    const result = t.projectChatConfigService.update({
      actor,
      projectId: t.projectId,
      provider: Slack,
      settings: slackSettings(foreign.id)
    });

    // Assert
    await expect(result).rejects.toThrow(
      new PermissionDeniedError({ message: "Selected slack integration is not in the same organization" })
    );
    expect(await t.memory.slackProjectChatConfigStore.findByProjectId(t.projectId)).toBeNull();
  });

  test("should refuse a Teams integration given as a Slack one", async () => {
    // Setup
    const t = build();
    const actor = await t.member();
    const teamsId = t.addTeams();

    // Action
    const result = t.projectChatConfigService.update({
      actor,
      projectId: t.projectId,
      provider: Slack,
      settings: slackSettings(teamsId)
    });

    // Assert
    await expect(result).rejects.toBeInstanceOf(EntityNotFoundError);
  });

  test("should refuse more than 20 Slack channels and change nothing", async () => {
    // Setup
    const t = build();
    const actor = await t.member();
    const integrationId = t.addSlack();
    const saved = await t.projectChatConfigService.update({
      actor,
      projectId: t.projectId,
      provider: Slack,
      settings: slackSettings(integrationId)
    });

    // Action
    const result = t.projectChatConfigService.update({
      actor,
      projectId: t.projectId,
      provider: Slack,
      settings: {
        ...slackSettings(integrationId),
        accessRequestChannels: Array.from({ length: 21 }, (_, i) => `C${i}`).join(",")
      }
    });

    // Assert
    await expect(result).rejects.toBeInstanceOf(RuleViolationError);
    await expect(result).rejects.toThrow("You can only select up to 20 slack channels");
    expect((await t.memory.slackProjectChatConfigStore.findByProjectId(t.projectId))?.toJSON()).toEqual(
      saved.config.toJSON()
    );
  });

  test("should refuse a Teams integration that is not installed and store nothing", async () => {
    // Setup
    const t = build();
    const actor = await t.member();
    const integrationId = t.addTeams({ installed: false });

    // Action
    const result = t.projectChatConfigService.update({
      actor,
      projectId: t.projectId,
      provider: MicrosoftTeams,
      settings: teamsSettings(integrationId)
    });

    // Assert
    await expect(result).rejects.toBeInstanceOf(RuleViolationError);
    await expect(result).rejects.toThrow("Microsoft Teams integration is not properly installed in your tenant.");
    expect(await t.memory.microsoftTeamsProjectChatConfigStore.findByProjectId(t.projectId)).toBeNull();
  });

  test("should refuse a Teams integration that does not exist", async () => {
    // Setup
    const t = build();
    const actor = await t.member();
    const integrationId = randomUUID();

    // Action
    const result = t.projectChatConfigService.update({
      actor,
      projectId: t.projectId,
      provider: MicrosoftTeams,
      settings: teamsSettings(integrationId)
    });

    // Assert
    await expect(result).rejects.toThrow(`Microsoft Teams integration with ID '${integrationId}' not found`);
  });

  test("should refuse Teams settings without channels before looking at the integration", async () => {
    // Setup
    const t = build();
    const actor = await t.member();

    // Action
    const result = t.projectChatConfigService.update({
      actor,
      projectId: t.projectId,
      provider: MicrosoftTeams,
      settings: { ...teamsSettings(randomUUID()), accessRequestChannels: undefined }
    });

    // Assert
    await expect(result).rejects.toThrow(
      "Access request channels are required when access request notifications are enabled"
    );
  });
});

describe("ProjectChatConfigService.get", () => {
  test("should return the project's settings for a member who can read project settings", async () => {
    // Setup
    const t = build();
    const admin = await t.member();
    const viewer = await t.member(ProjectMembershipRole.Viewer);
    const integrationId = t.addSlack();
    await t.projectChatConfigService.update({
      actor: admin,
      projectId: t.projectId,
      provider: Slack,
      settings: slackSettings(integrationId)
    });

    // Action
    const result = await t.projectChatConfigService.get({ actor: viewer, projectId: t.projectId, provider: Slack });

    // Assert
    expect(result.provider).toBe(Slack);
    expect(result.config.toJSON()).toMatchObject({ integrationId, accessRequestChannels: "C1, C2" });
  });

  test("should refuse with the legacy message when the project has no settings for the provider", async () => {
    // Setup
    const t = build();
    const actor = await t.member();

    // Action
    const result = t.projectChatConfigService.get({ actor, projectId: t.projectId, provider: MicrosoftTeams });

    // Assert
    await expect(result).rejects.toBeInstanceOf(EntityNotFoundError);
    await expect(result).rejects.toThrow(
      `Workflow integration config for project '${t.projectId}' and integration 'microsoft-teams' not found`
    );
  });

  test("should refuse an actor who is not a member of the project", async () => {
    // Setup
    const t = build();
    const otherProjectId = t.addProject();
    const actor = await t.member(ProjectMembershipRole.Admin, otherProjectId);

    // Action
    const result = t.projectChatConfigService.get({ actor, projectId: t.projectId, provider: Slack });

    // Assert
    await expect(result).rejects.toBeInstanceOf(PermissionDeniedError);
  });
});

describe("ProjectChatConfigService.delete", () => {
  test("should delete the project's settings for the given integration", async () => {
    // Setup
    const t = build();
    const actor = await t.member();
    const integrationId = t.addSlack();
    await t.projectChatConfigService.update({
      actor,
      projectId: t.projectId,
      provider: Slack,
      settings: slackSettings(integrationId)
    });

    // Action
    const deleted = await t.projectChatConfigService.delete({
      actor,
      projectId: t.projectId,
      provider: Slack,
      integrationId
    });

    // Assert
    expect(deleted.config.toJSON().integrationId).toBe(integrationId);
    expect(await t.memory.slackProjectChatConfigStore.findByProjectId(t.projectId)).toBeNull();
  });

  test("should refuse as not found and keep the settings when they point at another integration", async () => {
    // Setup
    const t = build();
    const actor = await t.member();
    const integrationId = t.addSlack();
    await t.projectChatConfigService.update({
      actor,
      projectId: t.projectId,
      provider: Slack,
      settings: slackSettings(integrationId)
    });
    const otherId = randomUUID();

    // Action
    const result = t.projectChatConfigService.delete({
      actor,
      projectId: t.projectId,
      provider: Slack,
      integrationId: otherId
    });

    // Assert
    await expect(result).rejects.toThrow(
      new EntityNotFoundError({
        message: `Workflow integration config for project '${t.projectId}' and integration 'slack' with ID '${otherId}' not found`
      })
    );
    expect(await t.memory.slackProjectChatConfigStore.findByProjectId(t.projectId)).not.toBeNull();
  });

  test("should leave the other provider's settings alone", async () => {
    // Setup
    const t = build();
    const actor = await t.member();
    const teamsId = t.addTeams();
    await t.projectChatConfigService.update({
      actor,
      projectId: t.projectId,
      provider: MicrosoftTeams,
      settings: teamsSettings(teamsId)
    });

    // Action
    const result = t.projectChatConfigService.delete({
      actor,
      projectId: t.projectId,
      provider: Slack,
      integrationId: teamsId
    });

    // Assert
    await expect(result).rejects.toBeInstanceOf(EntityNotFoundError);
    expect(await t.memory.microsoftTeamsProjectChatConfigStore.findByProjectId(t.projectId)).not.toBeNull();
  });

  test("should refuse an actor who cannot delete project settings and delete nothing", async () => {
    // Setup
    const t = build();
    const admin = await t.member();
    const viewer = await t.member(ProjectMembershipRole.Viewer);
    const integrationId = t.addSlack();
    await t.projectChatConfigService.update({
      actor: admin,
      projectId: t.projectId,
      provider: Slack,
      settings: slackSettings(integrationId)
    });

    // Action
    const result = t.projectChatConfigService.delete({
      actor: viewer,
      projectId: t.projectId,
      provider: Slack,
      integrationId
    });

    // Assert
    await expect(result).rejects.toBeInstanceOf(PermissionDeniedError);
    expect(await t.memory.slackProjectChatConfigStore.findByProjectId(t.projectId)).not.toBeNull();
  });
});
