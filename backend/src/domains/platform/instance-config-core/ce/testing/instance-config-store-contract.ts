import { randomUUID } from "node:crypto";

import { EnvOverrides } from "../models/env-overrides";
import { InstanceConfig } from "../models/instance-config";
import { LoginMethod } from "../models/login-policy";
import { TInstanceConfigStore } from "../services/dependencies";

type TSetup = () => Promise<{
  store: TInstanceConfigStore;
  addSamlOrg: () => Promise<{ id: string; slug: string }>;
}>;

const encrypt = (plainText: Buffer) => Buffer.from(`encrypted:${plainText.toString()}`);

const ownColumns = (config: InstanceConfig) => ({
  ...config.toJSON(),
  updatedAt: undefined,
  defaultAuthOrgSlug: undefined,
  defaultAuthOrgAuthEnforced: undefined,
  defaultAuthOrgAuthMethod: undefined
});

const newConfig = () => InstanceConfig.create({ fipsEnabled: false });

export const describeInstanceConfigStoreContract = (name: string, setup: TSetup) => {
  describe(`${name} instance config contract`, () => {
    test("should return null before the row is created", async () => {
      // Setup
      const { store } = await setup();

      // Action
      const found = await store.find();

      // Assert
      expect(found).toBeNull();
    });

    test("should return the row that was created", async () => {
      // Setup
      const { store } = await setup();
      const config = newConfig();

      // Action
      await store.createIfMissing(config);
      const found = await store.find();

      // Assert
      expect(found?.toSettings()).toMatchObject({
        id: config.id,
        instanceId: config.toSettings().instanceId,
        initialized: false,
        allowSignUp: true,
        fipsEnabled: false,
        onboardingCompleted: false,
        defaultAuthOrgId: null,
        defaultAuthOrgSlug: null
      });
    });

    test("should keep the first row's values when the row is created twice", async () => {
      // Setup
      const { store } = await setup();
      const first = newConfig();
      await store.createIfMissing(first);

      // Action
      await store.createIfMissing(InstanceConfig.create({ fipsEnabled: true }));

      // Assert
      const found = await store.find();
      expect(found?.toSettings().instanceId).toBe(first.toSettings().instanceId);
      expect(found?.toSettings().fipsEnabled).toBe(false);
    });

    test("should round trip every column the row owns, including every ciphertext", async () => {
      // Setup
      const { store, addSamlOrg } = await setup();
      const org = await addSamlOrg();
      await store.createIfMissing(newConfig());
      const config = await store.findForUpdate();
      if (!config) throw new Error("row missing");
      config.changeSignUpPolicy({ allowSignUp: false, allowedSignUpDomain: "example.com" });
      config.changeTrustLdapEmails(true);
      config.changeLoginMethods([LoginMethod.EMAIL, LoginMethod.GITHUB]);
      config.changeDefaultAuthOrg(org.id);
      config.changeBranding({ authConsentContent: "consent", pageFrameContent: "frame" });
      config.changeAllowedStorageHostnames(["a.example.com", "b.example.com"]);
      config.changeOnboardingStatus(true);
      config.completeSetup({ closeSignUp: false });
      config.grantAdminIdentity(randomUUID());
      config.changeSlackCredentials({ clientId: "slack-id", clientSecret: "slack-secret" }, encrypt);
      config.changeMicrosoftTeamsCredentials(
        { appId: "teams-app", clientSecret: "teams-secret", botId: "teams-bot" },
        encrypt
      );
      config.changeGitHubAppCredentials(
        { clientId: "gh-id", clientSecret: "gh-secret", appSlug: "gh-slug", appId: "gh-app", privateKey: "gh-key" },
        encrypt
      );
      config.replaceEnvOverrides(EnvOverrides.restore({ CLIENT_ID_GITHUB_LOGIN: "some-value" }), encrypt);

      // Action
      await store.save(config);

      // Assert
      const reloaded = await store.find();
      expect(reloaded && ownColumns(reloaded)).toEqual(ownColumns(config));
      expect(reloaded?.toSettings().defaultAuthOrgSlug).toBe(org.slug);
      expect(reloaded?.toSettings().defaultAuthOrgAuthMethod).toBe("saml");
    });

    test("should never write the joined default auth org fields", async () => {
      // Setup
      const { store } = await setup();
      await store.createIfMissing(newConfig());
      const config = await store.findForUpdate();
      if (!config) throw new Error("row missing");
      const forged = InstanceConfig.restore({
        ...config.toJSON(),
        defaultAuthOrgSlug: "forged",
        defaultAuthOrgAuthEnforced: true,
        defaultAuthOrgAuthMethod: "oidc"
      });

      // Action
      await store.save(forged);

      // Assert
      const settings = (await store.find())?.toSettings();
      expect(settings?.defaultAuthOrgSlug).toBeNull();
      expect(settings?.defaultAuthOrgAuthEnforced).toBeNull();
      expect(settings?.defaultAuthOrgAuthMethod).toBeNull();
    });

    test("should report the slug and sso method of the default auth org, and drop them when it is cleared", async () => {
      // Setup
      const { store, addSamlOrg } = await setup();
      const org = await addSamlOrg();
      await store.createIfMissing(newConfig());
      const config = await store.findForUpdate();
      if (!config) throw new Error("row missing");

      // Action
      config.changeDefaultAuthOrg(org.id);
      await store.save(config);
      const withOrg = (await store.find())?.toSettings();
      config.changeDefaultAuthOrg(null);
      await store.save(config);
      const cleared = (await store.find())?.toSettings();

      // Assert
      expect(withOrg?.defaultAuthOrgSlug).toBe(org.slug);
      expect(withOrg?.defaultAuthOrgAuthMethod).toBe("saml");
      expect(cleared?.defaultAuthOrgSlug).toBeNull();
      expect(cleared?.defaultAuthOrgAuthMethod).toBeNull();
    });

    test("should return the same row from findForUpdate as from find", async () => {
      // Setup
      const { store } = await setup();
      await store.createIfMissing(newConfig());

      // Action
      const locked = await store.findForUpdate();

      // Assert
      const found = await store.find();
      expect(locked && ownColumns(locked)).toEqual(found && ownColumns(found));
    });
  });
};
