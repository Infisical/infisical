import { RuleViolationError } from "@app/domains/lib/errors";

import { EnvOverrides } from "./env-overrides";
import { INSTANCE_CONFIG_ID, InstanceConfig, TInstanceConfigRecord } from "./instance-config";
import { LoginMethod } from "./login-policy";

const encrypt = (plainText: Buffer) => Buffer.from(`encrypted:${plainText.toString()}`);
const decrypt = (cipherText: Buffer) => Buffer.from(cipherText.toString().replace(/^encrypted:/, ""));

const distinctRecord = (): TInstanceConfigRecord => ({
  id: INSTANCE_CONFIG_ID,
  instanceId: "11111111-1111-4111-8111-111111111111",
  initialized: true,
  allowSignUp: false,
  allowedSignUpDomain: "signup.example.com",
  trustLdapEmails: true,
  defaultAuthOrgId: "22222222-2222-4222-8222-222222222222",
  enabledLoginMethods: ["email", "github"],
  authConsentContent: "consent",
  pageFrameContent: "frame",
  adminIdentityIds: ["33333333-3333-4333-8333-333333333333"],
  fipsEnabled: true,
  onboardingCompleted: true,
  allowedStorageHostnames: ["storage.example.com"],
  encryptedSlackClientId: Buffer.from("slack-client-id"),
  encryptedSlackClientSecret: Buffer.from("slack-client-secret"),
  encryptedMicrosoftTeamsAppId: Buffer.from("teams-app-id"),
  encryptedMicrosoftTeamsClientSecret: Buffer.from("teams-client-secret"),
  encryptedMicrosoftTeamsBotId: Buffer.from("teams-bot-id"),
  encryptedGitHubAppConnectionClientId: Buffer.from("gh-client-id"),
  encryptedGitHubAppConnectionClientSecret: Buffer.from("gh-client-secret"),
  encryptedGitHubAppConnectionSlug: Buffer.from("gh-slug"),
  encryptedGitHubAppConnectionId: Buffer.from("gh-app-id"),
  encryptedGitHubAppConnectionPrivateKey: Buffer.from("gh-private-key"),
  encryptedEnvOverrides: Buffer.from("env-overrides"),
  createdAt: new Date("2030-01-01T00:00:00.000Z"),
  updatedAt: new Date("2030-02-02T00:00:00.000Z"),
  defaultAuthOrgSlug: "default-org",
  defaultAuthOrgAuthEnforced: true,
  defaultAuthOrgAuthMethod: "saml"
});

const freshConfig = () => InstanceConfig.create({ fipsEnabled: false });

describe("InstanceConfig.restore", () => {
  test("should return every field of the record, each in its own place", () => {
    // Setup
    const record = distinctRecord();

    // Action
    const json = InstanceConfig.restore(record).toJSON();

    // Assert
    expect(json).toEqual(record);
  });

  test("should read null for columns the record leaves out", () => {
    // Setup
    const { id, instanceId, fipsEnabled, onboardingCompleted, createdAt, updatedAt } = distinctRecord();

    // Action
    const json = InstanceConfig.restore({
      id,
      instanceId,
      fipsEnabled,
      onboardingCompleted,
      createdAt,
      updatedAt
    }).toJSON();

    // Assert
    expect(json.encryptedEnvOverrides).toBeNull();
    expect(json.adminIdentityIds).toBeNull();
    expect(json.defaultAuthOrgSlug).toBeNull();
  });
});

describe("InstanceConfig.create", () => {
  test("should start with sign-up open and setup not done", () => {
    // Setup
    // Action
    const settings = InstanceConfig.create({ fipsEnabled: true }).toSettings();

    // Assert
    expect(settings).toMatchObject({
      id: INSTANCE_CONFIG_ID,
      initialized: false,
      allowSignUp: true,
      fipsEnabled: true,
      onboardingCompleted: false,
      defaultAuthOrgId: null
    });
  });
});

describe("InstanceConfig.toSettings", () => {
  test("should leave out every ciphertext column", () => {
    // Setup
    const config = InstanceConfig.restore(distinctRecord());

    // Action
    const keys = Object.keys(config.toSettings());

    // Assert
    expect(keys.filter((key) => key.startsWith("encrypted"))).toEqual([]);
    expect(keys).toHaveLength(19);
  });
});

describe("InstanceConfig.changeSignUpPolicy", () => {
  test("should change only the fields given", () => {
    // Setup
    const config = InstanceConfig.restore(distinctRecord());

    // Action
    config.changeSignUpPolicy({ allowSignUp: true, allowedSignUpDomain: null });

    // Assert
    expect(config.toSettings()).toMatchObject({
      allowSignUp: true,
      allowedSignUpDomain: null,
      trustLdapEmails: true
    });
  });
});

describe("InstanceConfig.changeLoginMethods", () => {
  test("should store the methods", () => {
    // Setup
    const config = freshConfig();

    // Action
    config.changeLoginMethods([LoginMethod.EMAIL, LoginMethod.GOOGLE]);

    // Assert
    expect(config.toSettings().enabledLoginMethods).toEqual(["email", "google"]);
  });

  test("should refuse an empty list and keep the methods", () => {
    // Setup
    const config = InstanceConfig.restore(distinctRecord());

    // Action
    const act = () => config.changeLoginMethods([]);

    // Assert
    expect(act).toThrow("At least one login method should be enabled.");
    expect(config.toSettings().enabledLoginMethods).toEqual(["email", "github"]);
  });
});

describe("InstanceConfig.changeDefaultAuthOrg", () => {
  test("should change the org id", () => {
    // Setup
    const config = freshConfig();

    // Action
    config.changeDefaultAuthOrg("44444444-4444-4444-8444-444444444444");

    // Assert
    expect(config.toSettings().defaultAuthOrgId).toBe("44444444-4444-4444-8444-444444444444");
  });
});

describe("InstanceConfig.changeBranding", () => {
  test("should change only the content given", () => {
    // Setup
    const config = InstanceConfig.restore(distinctRecord());

    // Action
    config.changeBranding({ pageFrameContent: "new frame" });

    // Assert
    expect(config.toSettings()).toMatchObject({ authConsentContent: "consent", pageFrameContent: "new frame" });
  });
});

describe("InstanceConfig.changeAllowedStorageHostnames", () => {
  test("should replace the hostnames", () => {
    // Setup
    const config = InstanceConfig.restore(distinctRecord());

    // Action
    config.changeAllowedStorageHostnames(["a.example.com"]);

    // Assert
    expect(config.toSettings().allowedStorageHostnames).toEqual(["a.example.com"]);
  });
});

describe("InstanceConfig.changeOnboardingStatus", () => {
  test("should store the status", () => {
    // Setup
    const config = freshConfig();

    // Action
    config.changeOnboardingStatus(true);

    // Assert
    expect(config.toSettings().onboardingCompleted).toBe(true);
  });
});

describe("InstanceConfig.completeSetup", () => {
  test("should close sign-up when asked to", () => {
    // Setup
    const config = freshConfig();

    // Action
    config.completeSetup({ closeSignUp: true });

    // Assert
    expect(config.toSettings().initialized).toBe(true);
    expect(config.toSettings().allowSignUp).toBe(false);
  });

  test("should leave sign-up open when not asked to close it", () => {
    // Setup
    const config = freshConfig();

    // Action
    config.completeSetup({ closeSignUp: false });

    // Assert
    expect(config.toSettings().initialized).toBe(true);
    expect(config.toSettings().allowSignUp).toBe(true);
  });
});

describe("InstanceConfig.grantAdminIdentity", () => {
  test("should add the identity once", () => {
    // Setup
    const config = freshConfig();

    // Action
    config.grantAdminIdentity("identity-1");
    config.grantAdminIdentity("identity-1");

    // Assert
    expect(config.toSettings().adminIdentityIds).toEqual(["identity-1"]);
    expect(config.isAdminIdentity("identity-1")).toBe(true);
  });
});

describe("InstanceConfig.revokeAdminIdentity", () => {
  test("should remove the identity", () => {
    // Setup
    const config = freshConfig();
    config.grantAdminIdentity("identity-1");
    config.grantAdminIdentity("identity-2");

    // Action
    config.revokeAdminIdentity("identity-1");

    // Assert
    expect(config.toSettings().adminIdentityIds).toEqual(["identity-2"]);
  });

  test("should refuse an identity that is not an admin", () => {
    // Setup
    const config = freshConfig();
    config.grantAdminIdentity("identity-1");

    // Action
    const act = () => config.revokeAdminIdentity("someone-else");

    // Assert
    expect(act).toThrow(RuleViolationError);
    expect(act).toThrow("Identity does not have super admin access");
    expect(config.toSettings().adminIdentityIds).toEqual(["identity-1"]);
  });
});

describe("InstanceConfig.changeSlackCredentials", () => {
  test("should store the credentials encrypted and read them back", () => {
    // Setup
    const config = freshConfig();

    // Action
    config.changeSlackCredentials({ clientId: "id", clientSecret: "secret" }, encrypt);

    // Assert
    expect(config.toJSON().encryptedSlackClientId?.toString()).toBe("encrypted:id");
    expect(config.slackCredentials(decrypt).toJSON()).toEqual({ clientId: "id", clientSecret: "secret" });
  });

  test.each([
    ["clientId", "Slack client ID cannot be empty"],
    ["clientSecret", "Slack client secret cannot be empty"]
  ])("should refuse an empty %s by name and change nothing", (field, message) => {
    // Setup
    const config = freshConfig();
    config.changeSlackCredentials({ clientId: "id", clientSecret: "secret" }, encrypt);

    // Action
    const act = () => config.changeSlackCredentials({ clientId: "new-id", [field]: "" }, encrypt);

    // Assert
    expect(act).toThrow(message);
    expect(config.slackCredentials(decrypt).toJSON()).toEqual({ clientId: "id", clientSecret: "secret" });
  });
});

describe("InstanceConfig.changeMicrosoftTeamsCredentials", () => {
  test("should keep the values left undefined", () => {
    // Setup
    const config = freshConfig();
    config.changeMicrosoftTeamsCredentials({ appId: "app", clientSecret: "secret", botId: "bot" }, encrypt);

    // Action
    config.changeMicrosoftTeamsCredentials({ botId: "new-bot" }, encrypt);

    // Assert
    expect(config.microsoftTeamsCredentials(decrypt).toJSON()).toEqual({
      appId: "app",
      clientSecret: "secret",
      botId: "new-bot"
    });
  });

  test.each([
    ["appId", "Microsoft Teams app ID cannot be empty"],
    ["clientSecret", "Microsoft Teams client secret cannot be empty"],
    ["botId", "Microsoft Teams bot ID cannot be empty"]
  ])("should refuse an empty %s by name and change nothing", (field, message) => {
    // Setup
    const config = freshConfig();
    config.changeMicrosoftTeamsCredentials({ appId: "app", clientSecret: "secret", botId: "bot" }, encrypt);

    // Action
    const act = () => config.changeMicrosoftTeamsCredentials({ [field]: "" }, encrypt);

    // Assert
    expect(act).toThrow(message);
    expect(config.microsoftTeamsCredentials(decrypt).toJSON()).toEqual({
      appId: "app",
      clientSecret: "secret",
      botId: "bot"
    });
  });
});

describe("InstanceConfig.changeGitHubAppCredentials", () => {
  test("should store an empty value, which clears it", () => {
    // Setup
    const config = freshConfig();
    config.changeGitHubAppCredentials(
      { clientId: "id", clientSecret: "secret", appSlug: "slug", appId: "app", privateKey: "key" },
      encrypt
    );

    // Action
    config.changeGitHubAppCredentials({ clientSecret: "" }, encrypt);

    // Assert
    expect(config.gitHubAppCredentials(decrypt).toJSON()).toEqual({
      clientId: "id",
      clientSecret: "",
      appSlug: "slug",
      appId: "app",
      privateKey: "key"
    });
  });
});

describe("InstanceConfig.replaceEnvOverrides", () => {
  test("should encrypt the overrides and read them back", () => {
    // Setup
    const config = freshConfig();
    const overrides = EnvOverrides.restore({ CLIENT_ID_GITHUB_LOGIN: "abc" });

    // Action
    config.replaceEnvOverrides(overrides, encrypt);

    // Assert
    expect(config.envOverrides(decrypt).toJSON()).toEqual({ CLIENT_ID_GITHUB_LOGIN: "abc" });
    expect(config.toJSON().encryptedEnvOverrides?.toString().startsWith("encrypted:")).toBe(true);
  });

  test("should read no overrides when none were stored", () => {
    // Setup
    const config = freshConfig();

    // Action
    const overrides = config.envOverrides(decrypt);

    // Assert
    expect(overrides.toJSON()).toEqual({});
    expect(config.envOverridesVersion()).toBe("");
  });

  test("should change the version when the overrides change", () => {
    // Setup
    const config = freshConfig();
    config.replaceEnvOverrides(EnvOverrides.restore({ CLIENT_ID_GITHUB_LOGIN: "1" }), encrypt);
    const before = config.envOverridesVersion();

    // Action
    config.replaceEnvOverrides(EnvOverrides.restore({ CLIENT_ID_GITHUB_LOGIN: "2" }), encrypt);

    // Assert
    expect(config.envOverridesVersion()).not.toBe(before);
  });
});
