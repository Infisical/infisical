import { randomBytes, randomUUID } from "node:crypto";

import { StateConflictError } from "@app/domains/lib/errors";

import { WorkflowIntegrationProvider, WorkflowIntegrationStatus } from "../models/enums";
import { MicrosoftTeamsTokenKind } from "../models/microsoft-teams-installation";
import { TWorkflowIntegrationStore } from "../services/dependencies";
import { microsoftTeamsIntegration, slackInstallation, slackIntegration } from "./workflow-integration-fixture";

export type TWorkflowIntegrationStoreHarness = {
  store: TWorkflowIntegrationStore;
  newOrgId: () => Promise<string>;
};

type TSetup = () => Promise<TWorkflowIntegrationStoreHarness>;

// Rows are created one await at a time, outside any shared transaction, so each gets its own now() and "oldest first"
// is decided by createdAt alone. A tie would not be a valid order, so no case relies on one.
export const describeWorkflowIntegrationStoreContract = (name: string, setup: TSetup) => {
  describe(`${name} workflow integration contract`, () => {
    test("should return the Slack integration as it was created", async () => {
      // Setup
      const { store, newOrgId } = await setup();
      const integration = slackIntegration({ orgId: await newOrgId(), description: "alerts" });
      await store.create(integration);

      // Action
      const found = await store.findById(integration.id);

      // Assert
      expect(found?.toJSON()).toEqual(integration.toJSON());
    });

    test("should return the Teams integration as it was created", async () => {
      // Setup
      const { store, newOrgId } = await setup();
      const integration = microsoftTeamsIntegration({ orgId: await newOrgId() });
      integration.changeMicrosoftTeamsInstallation((installation) =>
        installation
          .withToken(MicrosoftTeamsTokenKind.Graph, randomBytes(16), new Date("2031-01-01T00:00:00.000Z"))
          .withToken(MicrosoftTeamsTokenKind.BotFramework, randomBytes(16), new Date("2031-02-01T00:00:00.000Z"))
          .withInternalAppId("internal-app")
      );
      await store.create(integration);

      // Action
      const found = await store.findById(integration.id);

      // Assert
      expect(found?.toJSON()).toEqual(integration.toJSON());
    });

    test("should return null when the integration does not exist", async () => {
      // Setup
      const { store } = await setup();

      // Action
      const found = await store.findById(randomUUID());

      // Assert
      expect(found).toBeNull();
    });

    test("should list only the org's integrations, oldest first", async () => {
      // Setup
      const { store, newOrgId } = await setup();
      const [orgId, otherOrgId] = [await newOrgId(), await newOrgId()];
      const first = slackIntegration({ orgId });
      const second = microsoftTeamsIntegration({ orgId });
      const third = slackIntegration({ orgId });
      await store.create(first);
      await store.create(slackIntegration({ orgId: otherOrgId }));
      await store.create(second);
      await store.create(third);

      // Action
      const listed = await store.listByOrg(orgId);

      // Assert
      expect(listed.map((i) => i.id)).toEqual([first.id, second.id, third.id]);
    });

    test("should list only the integrations of the given provider and status", async () => {
      // Setup
      const { store, newOrgId } = await setup();
      const orgId = await newOrgId();
      const slack = slackIntegration({ orgId });
      const pendingTeams = microsoftTeamsIntegration({ orgId });
      const installedTeams = microsoftTeamsIntegration({ orgId });
      installedTeams.markInstalled();
      await store.create(slack);
      await store.create(pendingTeams);
      await store.create(installedTeams);

      // Action
      const teams = await store.listByOrg(orgId, { provider: WorkflowIntegrationProvider.MicrosoftTeams });
      const pending = await store.listByOrg(orgId, { status: WorkflowIntegrationStatus.Pending });
      const installedSlack = await store.listByOrg(orgId, {
        provider: WorkflowIntegrationProvider.Slack,
        status: WorkflowIntegrationStatus.Installed
      });

      // Assert
      expect(teams.map((i) => i.id)).toEqual([pendingTeams.id, installedTeams.id]);
      expect(pending.map((i) => i.id)).toEqual([pendingTeams.id]);
      expect(installedSlack.map((i) => i.id)).toEqual([slack.id]);
    });

    test("should list only the named integrations", async () => {
      // Setup
      const { store, newOrgId } = await setup();
      const orgId = await newOrgId();
      const wanted = slackIntegration({ orgId });
      const wantedTeams = microsoftTeamsIntegration({ orgId });
      await store.create(wanted);
      await store.create(slackIntegration({ orgId }));
      await store.create(wantedTeams);

      // Action
      const listed = await store.listByIds([wantedTeams.id, wanted.id, randomUUID()]);

      // Assert
      expect(listed.map((i) => i.id)).toEqual([wanted.id, wantedTeams.id]);
    });

    test("should list the Teams integrations of a tenant, ignoring Slack and other tenants", async () => {
      // Setup
      const { store, newOrgId } = await setup();
      const orgId = await newOrgId();
      const tenantId = randomUUID();
      const target = microsoftTeamsIntegration({ orgId, tenantId });
      await store.create(slackIntegration({ orgId, installation: slackInstallation({ teamId: tenantId }) }));
      await store.create(microsoftTeamsIntegration({ orgId }));
      await store.create(target);

      // Action
      const found = await store.listMicrosoftTeamsByTenantId(tenantId);
      const missing = await store.listMicrosoftTeamsByTenantId(randomUUID());

      // Assert
      expect(found.map((i) => i.id)).toEqual([target.id]);
      expect(missing).toEqual([]);
    });

    test("should list every org's Teams integration of a tenant, oldest first", async () => {
      // Setup
      const { store, newOrgId } = await setup();
      const tenantId = randomUUID();
      const oldest = microsoftTeamsIntegration({ orgId: await newOrgId(), tenantId });
      await store.create(oldest);
      const newer = microsoftTeamsIntegration({ orgId: await newOrgId(), tenantId });
      await store.create(newer);

      // Action
      const found = await store.listMicrosoftTeamsByTenantId(tenantId);

      // Assert
      expect(found.map((i) => i.id)).toEqual([oldest.id, newer.id]);
    });

    test("should persist a rename and a status change", async () => {
      // Setup
      const { store, newOrgId } = await setup();
      const integration = microsoftTeamsIntegration({ orgId: await newOrgId(), description: "before" });
      await store.create(integration);
      const loaded = await store.findById(integration.id);
      loaded?.rename({ slug: `renamed-${randomUUID().slice(0, 8)}`, description: "after" });
      loaded?.markInstalled();

      // Action
      await store.save(loaded!);

      // Assert
      const found = await store.findById(integration.id);
      expect(found?.toJSON()).toEqual(loaded?.toJSON());
      expect(found?.status).toBe(WorkflowIntegrationStatus.Installed);
    });

    test("should persist a Teams token change", async () => {
      // Setup
      const { store, newOrgId } = await setup();
      const integration = microsoftTeamsIntegration({ orgId: await newOrgId() });
      await store.create(integration);
      const loaded = await store.findById(integration.id);
      const token = randomBytes(24);
      const expiresAt = new Date("2032-03-04T05:06:07.000Z");
      loaded?.changeMicrosoftTeamsInstallation((installation) =>
        installation.withToken(MicrosoftTeamsTokenKind.Graph, token, expiresAt).withInternalAppId("app-1")
      );

      // Action
      await store.save(loaded!);

      // Assert
      const found = (await store.findById(integration.id))?.microsoftTeamsInstallation().toJSON();
      expect(found?.encryptedAccessToken).toEqual(token);
      expect(found?.accessTokenExpiresAt).toEqual(expiresAt);
      expect(found?.internalTeamsAppId).toBe("app-1");
      expect(found?.encryptedBotAccessToken).toBeNull();
    });

    test("should persist a Slack reinstall", async () => {
      // Setup
      const { store, newOrgId } = await setup();
      const integration = slackIntegration({ orgId: await newOrgId() });
      await store.create(integration);
      const loaded = await store.findById(integration.id);
      const reinstall = slackInstallation({ teamName: "new-team-name" });
      loaded?.reinstallSlack(reinstall);

      // Action
      await store.save(loaded!);

      // Assert
      const found = await store.findById(integration.id);
      expect(found?.slackInstallation().toJSON()).toEqual(reinstall.toJSON());
    });

    test("should remove a deleted integration", async () => {
      // Setup
      const { store, newOrgId } = await setup();
      const orgId = await newOrgId();
      const integration = slackIntegration({ orgId });
      const kept = microsoftTeamsIntegration({ orgId });
      await store.create(integration);
      await store.create(kept);

      // Action
      await store.delete(integration.id);

      // Assert
      expect(await store.findById(integration.id)).toBeNull();
      expect((await store.listByOrg(orgId)).map((i) => i.id)).toEqual([kept.id]);
    });

    test("should refuse a second integration with the same slug in the org", async () => {
      // Setup
      const { store, newOrgId } = await setup();
      const orgId = await newOrgId();
      const first = slackIntegration({ orgId, slug: "shared-slug", description: "first" });
      await store.create(first);

      // Action
      const result = store.create(microsoftTeamsIntegration({ orgId, slug: "shared-slug" }));

      // Assert
      await expect(result).rejects.toThrow(
        new StateConflictError({
          message: "A workflow integration with the slug 'shared-slug' already exists in this organization."
        })
      );
      expect((await store.listByOrg(orgId)).map((i) => i.toJSON())).toEqual([first.toJSON()]);
    });

    test("should refuse renaming to a slug another integration of the org has", async () => {
      // Setup
      const { store, newOrgId } = await setup();
      const orgId = await newOrgId();
      await store.create(slackIntegration({ orgId, slug: "taken" }));
      const second = slackIntegration({ orgId, slug: "free" });
      await store.create(second);
      second.rename({ slug: "taken" });

      // Action
      const result = store.save(second);

      // Assert
      await expect(result).rejects.toBeInstanceOf(StateConflictError);
      expect((await store.findById(second.id))?.slug).toBe("free");
    });

    test("should allow the same slug in another org", async () => {
      // Setup
      const { store, newOrgId } = await setup();
      const [orgId, otherOrgId] = [await newOrgId(), await newOrgId()];
      await store.create(slackIntegration({ orgId, slug: "shared-slug" }));
      const other = slackIntegration({ orgId: otherOrgId, slug: "shared-slug" });

      // Action
      await store.create(other);

      // Assert
      expect((await store.findById(other.id))?.slug).toBe("shared-slug");
    });
  });
};
