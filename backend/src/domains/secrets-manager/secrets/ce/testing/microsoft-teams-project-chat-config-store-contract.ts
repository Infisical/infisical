import { MicrosoftTeamsProjectChatConfig } from "../models/microsoft-teams-project-chat-config";
import { TMicrosoftTeamsProjectChatConfigStore } from "../services/dependencies";

export type TMicrosoftTeamsProjectChatConfigStoreHarness = {
  store: TMicrosoftTeamsProjectChatConfigStore;
  // A project and a Teams integration in its org, and a second integration in the same org.
  newProject: () => Promise<{ projectId: string; integrationId: string; otherIntegrationId: string }>;
};

type TSetup = () => Promise<TMicrosoftTeamsProjectChatConfigStoreHarness>;

const settings = (integrationId: string) => ({
  integrationId,
  isAccessRequestNotificationEnabled: true,
  accessRequestChannels: { teamId: "team-1", channelIds: ["c1", "c2"] },
  isSecretRequestNotificationEnabled: false,
  secretRequestChannels: { teamId: "team-1", channelIds: ["c3"] }
});

export const describeMicrosoftTeamsProjectChatConfigStoreContract = (name: string, setup: TSetup) => {
  describe(`${name} Microsoft Teams project chat config contract`, () => {
    test("should return the config as it was saved", async () => {
      // Setup
      const { store, newProject } = await setup();
      const { projectId, integrationId } = await newProject();
      const saved = await store.upsert(
        MicrosoftTeamsProjectChatConfig.create({ projectId, ...settings(integrationId) })
      );

      // Action
      const found = await store.findByProjectId(projectId);

      // Assert
      expect(found?.toJSON()).toEqual(saved.toJSON());
      expect(found?.toJSON()).toMatchObject({ accessRequestChannels: { teamId: "team-1", channelIds: ["c1", "c2"] } });
    });

    test("should read an event without channels back as having none", async () => {
      // Setup
      const { store, newProject } = await setup();
      const { projectId, integrationId } = await newProject();
      await store.upsert(
        MicrosoftTeamsProjectChatConfig.create({
          projectId,
          ...settings(integrationId),
          isSecretRequestNotificationEnabled: false,
          secretRequestChannels: undefined
        })
      );

      // Action
      const found = await store.findByProjectId(projectId);

      // Assert
      expect(found?.toJSON().secretRequestChannels).toBeNull();
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
      const first = await store.upsert(
        MicrosoftTeamsProjectChatConfig.create({ projectId, ...settings(integrationId) })
      );

      // Action
      const second = await store.upsert(
        MicrosoftTeamsProjectChatConfig.create({
          projectId,
          ...settings(otherIntegrationId),
          isAccessRequestNotificationEnabled: false,
          accessRequestChannels: { teamId: "team-2", channelIds: ["c9"] }
        })
      );

      // Assert
      expect(second.toJSON()).toMatchObject({
        id: first.toJSON().id,
        integrationId: otherIntegrationId,
        isAccessRequestNotificationEnabled: false,
        accessRequestChannels: { teamId: "team-2", channelIds: ["c9"] }
      });
      expect((await store.findByProjectId(projectId))?.toJSON()).toEqual(second.toJSON());
    });

    test("should delete the config only when it belongs to the given integration", async () => {
      // Setup
      const { store, newProject } = await setup();
      const { projectId, integrationId, otherIntegrationId } = await newProject();
      await store.upsert(MicrosoftTeamsProjectChatConfig.create({ projectId, ...settings(integrationId) }));

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
  });
};
