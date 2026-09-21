import { randomUUID } from "crypto";
import { FakeIamRotationMode, fakeIamUserSecret } from "e2e-test/fakes/aws-iam-user-secret-rotation-fns";
import { createAwsAppConnection, deleteAwsAppConnection } from "e2e-test/testUtils/app-connections";
import { createIsolatedOrgAndProject } from "e2e-test/testUtils/fixtures";
import { createFolder } from "e2e-test/testUtils/folders";
import {
  checkRotationCredentials,
  createSecretRotation,
  deleteSecretRotation,
  getGeneratedCredentials,
  getSecretRotation,
  listSecretRotations,
  rotateSecretRotation
} from "e2e-test/testUtils/secret-rotations";
import { createSecretV2, getSecretsV2, updateSecretV2 } from "e2e-test/testUtils/secrets";

import { SecretRotationStatus } from "@app/ee/services/secret-rotation-v2/secret-rotation-v2-enums";

// What is under test is the rotation plumbing: issuing the first credential, publishing each new
// one into the two mapped secrets, which credential the provider is handed to retire, and what
// survives a failure. The provider is AWS IAM user secrets, faked for the whole run
// (e2e-test/fakes/aws-iam-user-secret-rotation-fns.ts and the alias block in
// vitest.e2e.config.mts), so none of this reaches IAM.
//
// Every assertion is on state a user or an operator could see: the secrets at the path, the keys
// on the IAM user, the rotation's own status. Nothing asserts that the factory was called, or
// with what. The two rotation shapes are covered by running the same lifecycle against a fake in
// each mode, and because each mode retires a different one of the two credentials the service
// offers it, the surviving keys are what say the service offered the right ones.

const ENV = "dev";

// The two secret keys the rotation writes its credentials to, which is the whole of what it
// publishes into the project.
const SECRET_KEYS = { accessKeyId: "AWS_ACCESS_KEY_ID", secretAccessKey: "AWS_SECRET_ACCESS_KEY" };

// The fake issues keys in order from a counter that resets between tests, so a spec can name the
// credential it expects rather than reading it back out of the fake first. `credential(1)` is the
// one creating the rotation issued, `credential(2)` the one the first rotation issued, and so on.
const credential = (sequence: number) => ({
  accessKeyId: `AKIAFAKE${String(sequence).padStart(4, "0")}`,
  secretAccessKey: `fake-secret-access-key-${String(sequence).padStart(4, "0")}`
});

// The mapped secrets as they look when they are holding this credential.
const secretsHolding = (sequence: number) => ({
  [SECRET_KEYS.accessKeyId]: credential(sequence).accessKeyId,
  [SECRET_KEYS.secretAccessKey]: credential(sequence).secretAccessKey
});

// The IAM user's keys when exactly these credentials are live on it.
const liveKeys = (...sequences: number[]) =>
  Object.fromEntries(
    sequences.map((sequence) => [credential(sequence).accessKeyId, credential(sequence).secretAccessKey])
  );

describe("Secret rotations", async () => {
  // Rotating is synchronous but does a fair amount of KMS work per call, and a lifecycle test
  // creates an org, a project, a connection and a rotation and then rotates twice, which is more
  // than the 5s default allows for.
  vi.setConfig({ testTimeout: 30_000, hookTimeout: 30_000 });

  let projectId: string;
  let connectionId: string;
  let authToken: string;
  let cleanupOrg: () => Promise<void>;

  const secretsAt = async (secretPath: string) => {
    const { secrets } = await getSecretsV2({ authToken, workspaceId: projectId, environmentSlug: ENV, secretPath });
    return Object.fromEntries(secrets.map((secret) => [secret.secretKey, secret.secretValue]));
  };

  // Creates a rotation at /services with the standard secret keys. The options are the two things
  // tests vary: the keys it publishes to (for the tests about keys already being taken) and the
  // status a refused creation is expected to answer with.
  const newRotation = async (
    name: string,
    options: {
      secretsMapping?: { accessKeyId: string; secretAccessKey: string };
      secretPath?: string;
      expectStatusCode?: number;
    } = {}
  ) =>
    createSecretRotation({
      name,
      projectId,
      connectionId,
      environmentSlug: ENV,
      secretPath: options.secretPath ?? "/services",
      secretsMapping: options.secretsMapping ?? SECRET_KEYS,
      expectStatusCode: options.expectStatusCode,
      authToken
    });

  // A fresh org and project per test, so no test can be reached by another's writes or teardown.
  // An app connection is org-scoped rather than project-scoped, so sharing one would leave a
  // single row every test's rotations hang off. A rotation left behind in a shared org would also
  // be picked up by the rotation cron, which under NODE_ENV=test treats every auto-enabled
  // rotation as due and runs it inline once a minute.
  beforeEach(async () => {
    fakeIamUserSecret.reset();

    ({ projectId, authToken, cleanup: cleanupOrg } = await createIsolatedOrgAndProject("secret-rotation-e2e"));

    connectionId = await createAwsAppConnection({
      name: `secret-rotation-e2e-${randomUUID().slice(0, 8)}`,
      authToken
    });

    await createFolder({ authToken, workspaceId: projectId, environmentSlug: ENV, secretPath: "/", name: "services" });
  });

  afterEach(async () => {
    // Order matters. A rotation holds a foreign key to the connection, so the connection delete
    // fails on the constraint while any rotation is still pointing at it. Whatever each test left
    // is read back from the project rather than tracked, so a test that deletes its own rotation
    // needs no bookkeeping here. Neither flag is set: the secrets go with the org, and the fake's
    // keys go with the reset.
    const rotations = await listSecretRotations({ projectId, authToken });
    for (const rotation of rotations) {
      // eslint-disable-next-line no-await-in-loop
      await deleteSecretRotation({
        rotationId: rotation.id,
        deleteSecrets: false,
        revokeGeneratedCredentials: false,
        authToken
      });
    }

    await deleteAwsAppConnection({ connectionId, authToken });
    await cleanupOrg();
  });

  describe("Creating a rotation issues the first credential and publishes it", () => {
    test("The mapped secrets hold the issued credential and the provider has one live key", async () => {
      const { secretRotation } = await newRotation("publishes-first-credential");

      expect(await secretsAt("/services")).toEqual(secretsHolding(1));
      expect(fakeIamUserSecret.keys()).toEqual(liveKeys(1));
      expect(secretRotation!.activeIndex).toBe(0);
      expect(secretRotation!.rotationStatus).toBe(SecretRotationStatus.Success);
      // Auto rotation is off, so there is nothing for the cron to pick up:
      // findSecretRotationsToQueue gates on this being set as well as on isAutoRotationEnabled.
      expect(secretRotation!.nextRotationAt).toBeNull();
    });
  });

  // The two provider shapes. Both rotate through the same service call and both are handed the
  // same two credentials; they differ in which one they retire, so the keys left live are what
  // show the service handed over the right ones. Getting them the wrong way round would revoke
  // the credential the mapped secrets are publishing.
  describe("A rotation publishes the new credential and offers the provider the one it displaces", () => {
    test("A provider that replaces its credential in place is left with only the published one", async () => {
      fakeIamUserSecret.setMode(FakeIamRotationMode.ReplaceInPlace);

      const { secretRotation } = await newRotation("replace-in-place");
      const rotationId = secretRotation!.id;

      // The provider retires the credential it was told is active, which is the one the mapped
      // secrets were publishing until this call. Its predecessor is long dead.
      const first = await rotateSecretRotation({ rotationId, authToken });

      expect(await secretsAt("/services")).toEqual(secretsHolding(2));
      expect(fakeIamUserSecret.keys()).toEqual(liveKeys(2));
      expect(first.secretRotation!.activeIndex).toBe(1);
      expect(first.secretRotation!.rotationStatus).toBe(SecretRotationStatus.Success);
      expect(first.secretRotation!.nextRotationAt).toBeNull();

      const second = await rotateSecretRotation({ rotationId, authToken });

      expect(await secretsAt("/services")).toEqual(secretsHolding(3));
      expect(fakeIamUserSecret.keys()).toEqual(liveKeys(3));
      // Back to the first slot: two slots, alternating.
      expect(second.secretRotation!.activeIndex).toBe(0);
    });

    test("A provider that runs two credentials keeps the previous one live and retires the one before it", async () => {
      fakeIamUserSecret.setMode(FakeIamRotationMode.IssueAndDisplace);

      const { secretRotation } = await newRotation("issue-and-displace");
      const rotationId = secretRotation!.id;

      // Nothing is displaced on the first rotation, because only one slot has ever been filled,
      // so the credential creating the rotation issued stays live alongside the new one.
      const first = await rotateSecretRotation({ rotationId, authToken });

      expect(await secretsAt("/services")).toEqual(secretsHolding(2));
      expect(fakeIamUserSecret.keys()).toEqual(liveKeys(1, 2));
      expect(first.secretRotation!.activeIndex).toBe(1);

      // The second rotation displaces the first credential, never the one the mapped secrets are
      // publishing.
      const second = await rotateSecretRotation({ rotationId, authToken });

      expect(await secretsAt("/services")).toEqual(secretsHolding(3));
      expect(fakeIamUserSecret.keys()).toEqual(liveKeys(2, 3));
      expect(second.secretRotation!.activeIndex).toBe(0);
    });

    test("Both credentials are readable, newest in the slot the active index names", async () => {
      const { secretRotation } = await newRotation("generated-credentials");
      const rotationId = secretRotation!.id;

      await rotateSecretRotation({ rotationId, authToken });
      await rotateSecretRotation({ rotationId, authToken });

      expect(await getGeneratedCredentials({ rotationId, authToken })).toEqual({
        generatedCredentials: [credential(3), credential(2)],
        activeIndex: 0
      });
    });
  });

  describe("A rotation that cannot issue a credential changes nothing", () => {
    test("A provider that refuses the first credential leaves no rotation and no secrets", async () => {
      fakeIamUserSecret.failIssueWith("IAM denied CreateAccessKey");

      const { error } = await newRotation("issue-refused", { expectStatusCode: 400 });

      expect(error!.message).toContain("IAM denied CreateAccessKey");
      expect(fakeIamUserSecret.keys()).toEqual({});
      expect(await secretsAt("/services")).toEqual({});
      expect(await listSecretRotations({ projectId, authToken })).toEqual([]);
    });

    test("A provider that refuses a later credential leaves the working one published", async () => {
      const { secretRotation } = await newRotation("issue-refused-later");
      const rotationId = secretRotation!.id;

      fakeIamUserSecret.failIssueWith("IAM throttled CreateAccessKey");

      // A provider failure answers 500 rather than 4xx: rotateSecretRotation wraps whatever
      // rotateGeneratedCredentials threw in an InternalServerError.
      const { error } = await rotateSecretRotation({ rotationId, authToken, expectStatusCode: 500 });
      expect(error!.message).toContain("IAM throttled CreateAccessKey");

      // The credential users hold is untouched, at the provider and in the mapped secrets.
      expect(fakeIamUserSecret.keys()).toEqual(liveKeys(1));
      expect(await secretsAt("/services")).toEqual(secretsHolding(1));

      const failed = await getSecretRotation({ rotationId, authToken });
      expect(failed.rotationStatus).toBe(SecretRotationStatus.Failed);
      expect(failed.lastRotationMessage).toContain("IAM throttled CreateAccessKey");
      expect(failed.activeIndex).toBe(0);
    });

    test("A provider that fails after the new credential is published reports failure on a rotation that happened", async () => {
      const { secretRotation } = await newRotation("fails-after-publish");
      const rotationId = secretRotation!.id;

      fakeIamUserSecret.failAfterPersistWith("IAM denied DeleteAccessKey");

      const { error } = await rotateSecretRotation({ rotationId, authToken, expectStatusCode: 500 });
      expect(error!.message).toContain("IAM denied DeleteAccessKey");

      // The write half of the rotation committed before the provider threw, so the new credential
      // is live and published while the rotation reports failed. A provider that retires the
      // displaced credential after publishing rather than before lands here.
      expect(await secretsAt("/services")).toEqual(secretsHolding(2));

      const failed = await getSecretRotation({ rotationId, authToken });
      expect(failed.activeIndex).toBe(1);
      expect(failed.rotationStatus).toBe(SecretRotationStatus.Failed);
    });
  });

  describe("A rotation is created against one free set of secret keys at one existing secret path", () => {
    test("Creating a rotation is refused when the name is already used at the path", async () => {
      await newRotation("taken-name");

      const { error } = await newRotation("taken-name", {
        // Different keys, so this can only fail on the name.
        secretsMapping: { accessKeyId: "OTHER_ACCESS_KEY_ID", secretAccessKey: "OTHER_SECRET_ACCESS_KEY" },
        expectStatusCode: 400
      });

      expect(error!.message).toContain("taken-name");
      expect(error!.message).toContain("/services");
      expect(await listSecretRotations({ projectId, authToken })).toHaveLength(1);
    });

    test("Creating a rotation is refused when a mapped secret key already exists", async () => {
      await createSecretV2({
        authToken,
        workspaceId: projectId,
        environmentSlug: ENV,
        secretPath: "/services",
        key: "HAND_WRITTEN_KEY",
        value: "hand-written-value"
      });

      const { error } = await newRotation("taken-key", {
        secretsMapping: { accessKeyId: "HAND_WRITTEN_KEY", secretAccessKey: "OTHER_SECRET_ACCESS_KEY" },
        expectStatusCode: 400
      });

      expect(error!.message).toContain("HAND_WRITTEN_KEY");
      // The hand-written secret is still its own, and no credential was issued for a rotation
      // that was refused before it reached the provider.
      expect(await secretsAt("/services")).toEqual({ HAND_WRITTEN_KEY: "hand-written-value" });
      expect(fakeIamUserSecret.keys()).toEqual({});
    });

    test("Creating a rotation is refused when the secret path does not exist", async () => {
      const { error } = await newRotation("missing-path", { secretPath: "/does/not/exist", expectStatusCode: 400 });

      expect(error!.message).toContain("/does/not/exist");
      expect(error!.message).toContain(ENV);
      expect(fakeIamUserSecret.keys()).toEqual({});
    });
  });

  describe("The rotation owns its mapped secrets until it is deleted", () => {
    test("A mapped secret cannot be given a value by hand", async () => {
      await newRotation("owns-secrets");

      await updateSecretV2({
        workspaceId: projectId,
        environmentSlug: ENV,
        secretPath: "/services",
        key: SECRET_KEYS.accessKeyId,
        value: "hand-written-value",
        authToken
      }).expect((res) => {
        expect(res.statusCode).toBe(400);
        expect(res.json().message).toContain("Cannot update rotated secret");
      });
      expect(await secretsAt("/services")).toEqual(secretsHolding(1));
    });

    test("Deleting a rotation with both flags set revokes the credentials and removes the secrets", async () => {
      const { secretRotation } = await newRotation("deletes-everything");
      const rotationId = secretRotation!.id;

      await rotateSecretRotation({ rotationId, authToken });

      await deleteSecretRotation({ rotationId, deleteSecrets: true, revokeGeneratedCredentials: true, authToken });

      // Both slots are revoked, not just the published one, so the previous credential cannot
      // outlive the rotation that issued it.
      expect(fakeIamUserSecret.keys()).toEqual({});
      expect(await secretsAt("/services")).toEqual({});
      expect(await listSecretRotations({ projectId, authToken })).toEqual([]);
    });

    test("Deleting a rotation with neither flag set leaves the credential live and the secrets editable", async () => {
      const { secretRotation } = await newRotation("leaves-everything");

      await deleteSecretRotation({
        rotationId: secretRotation!.id,
        deleteSecrets: false,
        revokeGeneratedCredentials: false,
        authToken
      });

      // The provider was never asked to revoke anything, so the credential still works. This is
      // the escape hatch for a rotation whose credential is in use elsewhere.
      expect(fakeIamUserSecret.keys()).toEqual(liveKeys(1));
      expect(await secretsAt("/services")).toEqual(secretsHolding(1));

      // Nothing owns the secrets now, so the write the rotation refused above succeeds.
      await updateSecretV2({
        workspaceId: projectId,
        environmentSlug: ENV,
        secretPath: "/services",
        key: SECRET_KEYS.accessKeyId,
        value: "hand-written-value",
        authToken
      });

      expect((await secretsAt("/services"))[SECRET_KEYS.accessKeyId]).toBe("hand-written-value");
    });
  });

  describe("A credential check reports what the provider says about the active credential", () => {
    test("A credential revoked at the provider fails the check", async () => {
      const { secretRotation } = await newRotation("check-credentials");
      const rotationId = secretRotation!.id;

      await checkRotationCredentials({ rotationId, authToken });

      fakeIamUserSecret.revokeOutOfBand(credential(1).accessKeyId);

      const error = await checkRotationCredentials({ rotationId, authToken, expectStatusCode: 400 });

      expect(error!.message).toContain(credential(1).accessKeyId);
      // The check reports, it does not repair: the rotation still holds the dead credential.
      expect(await secretsAt("/services")).toEqual(secretsHolding(1));
    });
  });
});
