import { randomUUID } from "node:crypto";

import { RuleViolationError } from "@app/domains/lib/errors";

import {
  microsoftTeamsIntegration,
  slackInstallation,
  slackIntegration
} from "../testing/workflow-integration-fixture";
import { WorkflowIntegrationProvider, WorkflowIntegrationStatus } from "./enums";
import { WorkflowIntegration } from "./workflow-integration";

describe("WorkflowIntegration.createSlack / createMicrosoftTeams", () => {
  test("should start a Slack integration installed", () => {
    // Setup
    const orgId = randomUUID();

    // Action
    const integration = slackIntegration({ orgId });

    // Assert
    expect(integration.status).toBe(WorkflowIntegrationStatus.Installed);
    expect(integration.isInstalled()).toBe(true);
  });

  test("should start a Microsoft Teams integration pending until the bot is in the tenant", () => {
    // Setup
    const orgId = randomUUID();

    // Action
    const integration = microsoftTeamsIntegration({ orgId });

    // Assert
    expect(integration.status).toBe(WorkflowIntegrationStatus.Pending);
    expect(integration.isInstalled()).toBe(false);
  });
});

describe("WorkflowIntegration.rename", () => {
  test("should change only the fields that are given", () => {
    // Setup
    const integration = slackIntegration({ orgId: randomUUID(), slug: "alerts", description: "old" });

    // Action
    integration.rename({ slug: "ops" });
    integration.rename({ description: undefined });

    // Assert
    expect(integration.slug).toBe("ops");
    expect(integration.description).toBe("old");
  });

  test("should change the description alone", () => {
    // Setup
    const integration = slackIntegration({ orgId: randomUUID(), slug: "alerts", description: "old" });

    // Action
    integration.rename({ description: "new" });

    // Assert
    expect(integration.slug).toBe("alerts");
    expect(integration.description).toBe("new");
  });
});

describe("WorkflowIntegration.assertProvider", () => {
  test("should refuse the other provider and say which one the integration is", () => {
    // Setup
    const integration = slackIntegration({ orgId: randomUUID() });

    // Action
    const act = () => integration.assertProvider(WorkflowIntegrationProvider.MicrosoftTeams);

    // Assert
    expect(act).toThrow(RuleViolationError);
    expect(act).toThrow(
      `Workflow integration with ID '${integration.id}' is a Slack integration, not a Microsoft Teams integration`
    );
  });

  test("should accept its own provider", () => {
    // Setup
    const integration = microsoftTeamsIntegration({ orgId: randomUUID() });

    // Action
    const act = () => integration.assertProvider(WorkflowIntegrationProvider.MicrosoftTeams);

    // Assert
    expect(act).not.toThrow();
  });
});

describe("WorkflowIntegration.slackInstallation / microsoftTeamsInstallation", () => {
  test("should refuse the Teams installation of a Slack integration", () => {
    // Setup
    const integration = slackIntegration({ orgId: randomUUID() });

    // Action
    const act = () => integration.microsoftTeamsInstallation();

    // Assert
    expect(act).toThrow(RuleViolationError);
    expect(act).toThrow("is a Slack integration, not a Microsoft Teams integration");
  });

  test("should refuse the Slack installation of a Teams integration", () => {
    // Setup
    const integration = microsoftTeamsIntegration({ orgId: randomUUID() });

    // Action
    const act = () => integration.slackInstallation();

    // Assert
    expect(act).toThrow(RuleViolationError);
    expect(act).toThrow("is a Microsoft Teams integration, not a Slack integration");
  });
});

describe("WorkflowIntegration.reinstallSlack", () => {
  test("should replace the installation and keep id, slug and org", () => {
    // Setup
    const integration = slackIntegration({ orgId: randomUUID(), slug: "alerts" });
    const { id, orgId } = integration;
    const replacement = slackInstallation({ teamId: "T-new" });

    // Action
    integration.reinstallSlack(replacement);

    // Assert
    expect(integration.slackInstallation().teamId).toBe("T-new");
    expect([integration.id, integration.orgId, integration.slug]).toEqual([id, orgId, "alerts"]);
  });

  test("should refuse a Teams integration and leave it as it was", () => {
    // Setup
    const integration = microsoftTeamsIntegration({ orgId: randomUUID() });
    const before = integration.toJSON();

    // Action
    const act = () => integration.reinstallSlack(slackInstallation());

    // Assert
    expect(act).toThrow(RuleViolationError);
    expect(integration.toJSON()).toEqual(before);
  });
});

describe("WorkflowIntegration.restore", () => {
  test("should round-trip a Slack integration through its record", () => {
    // Setup
    const integration = slackIntegration({ orgId: randomUUID(), description: "alerts channel" });

    // Action
    const restored = WorkflowIntegration.restore(integration.toJSON());

    // Assert
    expect(restored.toJSON()).toEqual(integration.toJSON());
  });

  test("should round-trip a Microsoft Teams integration through its record", () => {
    // Setup
    const integration = microsoftTeamsIntegration({ orgId: randomUUID(), tenantId: "tenant-1" });
    integration.markInstalled();

    // Action
    const restored = WorkflowIntegration.restore(integration.toJSON());

    // Assert
    expect(restored.toJSON()).toEqual(integration.toJSON());
    expect(restored.isInstalled()).toBe(true);
  });
});
