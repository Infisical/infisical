import { SlackProjectChatConfig } from "../models/slack-project-chat-config";
import { TSlackProjectChatConfigStore } from "../services/dependencies";

export type TSlackProjectChatConfigStoreHarness = {
  store: TSlackProjectChatConfigStore;
  // A project and a Slack integration in its org, and a second integration in the same org.
  newProject: () => Promise<{ projectId: string; integrationId: string; otherIntegrationId: string }>;
};

type TSetup = () => Promise<TSlackProjectChatConfigStoreHarness>;

const settings = (integrationId: string) => ({
  integrationId,
  isAccessRequestNotificationEnabled: true,
  accessRequestChannels: "C1,C2",
  isSecretRequestNotificationEnabled: false,
  secretRequestChannels: "C3",
  isSecretSyncErrorNotificationEnabled: true,
  secretSyncErrorChannels: "C4"
});

export const describeSlackProjectChatConfigStoreContract = (name: string, setup: TSetup) => {
  describe(`${name} Slack project chat config contract`, () => {
    test("should return the config as it was saved", async () => {
      // Setup
      const { store, newProject } = await setup();
      const { projectId, integrationId } = await newProject();
      const saved = await store.upsert(SlackProjectChatConfig.create({ projectId, ...settings(integrationId) }));

      // Action
      const found = await store.findByProjectId(projectId);

      // Assert
      expect(found?.toJSON()).toEqual(saved.toJSON());
      expect(found?.toJSON()).toMatchObject({ accessRequestChannels: "C1, C2", integrationId });
    });

    test("should return null when the project has no config", async () => {
      // Setup
      const { store, newProject } = await setup();
      const { projectId } = await newProject();

      // Action
      const found = await store.findByProjectId(projectId);

      // Assert
      expect(found).toBeNull();
    });

    test("should replace the settings of the project's config and keep its id when saved again", async () => {
      // Setup
      const { store, newProject } = await setup();
      const { projectId, integrationId, otherIntegrationId } = await newProject();
      const first = await store.upsert(SlackProjectChatConfig.create({ projectId, ...settings(integrationId) }));

      // Action
      const second = await store.upsert(
        SlackProjectChatConfig.create({
          projectId,
          ...settings(otherIntegrationId),
          isAccessRequestNotificationEnabled: false,
          accessRequestChannels: "C9"
        })
      );

      // Assert
      expect(second.toJSON()).toMatchObject({
        id: first.toJSON().id,
        integrationId: otherIntegrationId,
        isAccessRequestNotificationEnabled: false,
        accessRequestChannels: "C9"
      });
      expect((await store.findByProjectId(projectId))?.toJSON()).toEqual(second.toJSON());
    });

    test("should delete the config only when it belongs to the given integration", async () => {
      // Setup
      const { store, newProject } = await setup();
      const { projectId, integrationId, otherIntegrationId } = await newProject();
      await store.upsert(SlackProjectChatConfig.create({ projectId, ...settings(integrationId) }));

      // Action
      const wrongIntegration = await store.deleteByProjectAndIntegration(projectId, otherIntegrationId);
      const kept = await store.findByProjectId(projectId);
      const deleted = await store.deleteByProjectAndIntegration(projectId, integrationId);

      // Assert
      expect(wrongIntegration).toBeNull();
      expect(kept).not.toBeNull();
      expect(deleted?.toJSON().projectId).toBe(projectId);
      expect(await store.findByProjectId(projectId)).toBeNull();
    });

    test("should not touch another project's config when deleting", async () => {
      // Setup
      const { store, newProject } = await setup();
      const mine = await newProject();
      const other = await newProject();
      await store.upsert(
        SlackProjectChatConfig.create({ projectId: other.projectId, ...settings(other.integrationId) })
      );

      // Action
      const deleted = await store.deleteByProjectAndIntegration(mine.projectId, other.integrationId);

      // Assert
      expect(deleted).toBeNull();
      expect(await store.findByProjectId(other.projectId)).not.toBeNull();
    });
  });
};
