import { randomUUID } from "crypto";
import { FakeIamRotationMode, fakeIamUserSecret } from "e2e-test/fakes/aws-iam-user-secret-rotation-fns";
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
// The AWS app connection helpers live with the secret sync utils, which is where the first specs
// to need them put them.
import { createAwsAppConnection, deleteAppConnection } from "e2e-test/testUtils/secret-syncs";
import { createSecretV2, getSecretsV2, updateSecretV2 } from "e2e-test/testUtils/secrets";

import { SecretRotationStatus } from "@app/ee/services/secret-rotation-v2/secret-rotation-v2-enums";

// What is under test is the rotation plumbing: issuing the first credential, publishing each new
// one into the mapped secrets, which credential the provider is handed to retire, and what
// survives a failure. The provider is AWS IAM user secrets, faked for the whole run
// (e2e-test/fakes/aws-iam-user-secret-rotation-fns.ts and the alias block in
// vitest.e2e.config.mts), so none of this reaches IAM.
//
// The provider side of rotation comes in two shapes, and the service treats both identically:
// it computes an active slot and a displaced slot from activeIndex and hands the factory both.
// The lifecycle rule below therefore runs once per shape, asserting the arguments the factory
// received rather than only the credentials that came back out. A provider that replaces its
// credential in place reads activeCredentials; one that runs two live credentials reads
// credentialsToRevoke. Handing either the wrong one revokes the credential users hold.

const ENV = "dev";

const MAPPING = { accessKeyId: "AWS_ACCESS_KEY_ID", secretAccessKey: "AWS_SECRET_ACCESS_KEY" };

// The fake issues keys in order from a counter that resets between tests, so a spec can name the
// credential it expects instead of reading it back out of the fake first.
const credential = (sequence: number) => ({
  accessKeyId: `AKIAFAKE${String(sequence).padStart(4, "0")}`,
  secretAccessKey: `fake-secret-access-key-${String(sequence).padStart(4, "0")}`
});

const mappedSecretsFor = (sequence: number) => ({
  [MAPPING.accessKeyId]: credential(sequence).accessKeyId,
  [MAPPING.secretAccessKey]: credential(sequence).secretAccessKey
});

const keyStoreFor = (...sequences: number[]) =>
  Object.fromEntries(
    sequences.map((sequence) => [credential(sequence).accessKeyId, credential(sequence).secretAccessKey])
  );

describe("Secret rotations", async () => {
  // Rotating is synchronous but does a fair amount of KMS work per call, and the lifecycle test
  // creates a project, a connection, a rotation and then rotates twice, which is more than the
  // 5s default allows for.
  vi.setConfig({ testTimeout: 30_000, hookTimeout: 30_000 });

  let projectId: string;
  let connectionId: string;

  const addSecret = (secretPath: string, key: string, value: string) =>
    createSecretV2({ authToken: jwtAuthToken, workspaceId: projectId, environmentSlug: ENV, secretPath, key, value });

  const secretsAt = async (secretPath: string) => {
    const { secrets } = await getSecretsV2({
      authToken: jwtAuthToken,
      workspaceId: projectId,
      environmentSlug: ENV,
      secretPath
    });
    return Object.fromEntries(secrets.map((secret) => [secret.secretKey, secret.secretValue]));
  };

  const newRotation = (
    name: string,
    overrides: Partial<Parameters<typeof createSecretRotation>[0]> = {},
    secretPath = "/services"
  ) =>
    createSecretRotation({
      name,
      projectId,
      connectionId,
      environmentSlug: ENV,
      secretPath,
      secretsMapping: MAPPING,
      authToken: jwtAuthToken,
      ...overrides
    });

  // Everything a test touches is built here and torn down after it. An app connection is
  // org-scoped rather than project-scoped, so sharing one would leave a single row that every
  // test's rotations hang off, and a rotation left behind in the seeded project would be picked
  // up by the rotation cron, which under NODE_ENV=test treats every auto-enabled rotation as due
  // and runs it inline once a minute.
  beforeEach(async () => {
    fakeIamUserSecret.reset();

    const suffix = randomUUID().slice(0, 8);

    const projectRes = await testServer.inject({
      method: "POST",
      url: "/api/v1/projects",
      headers: { authorization: `Bearer ${jwtAuthToken}` },
      body: { projectName: `secret-rotation-e2e-${suffix}` }
    });
    expect(projectRes.statusCode).toBe(200);
    projectId = projectRes.json().project.id as string;

    connectionId = await createAwsAppConnection({
      name: `secret-rotation-e2e-${suffix}`,
      authToken: jwtAuthToken
    });

    await createFolder({
      authToken: jwtAuthToken,
      workspaceId: projectId,
      environmentSlug: ENV,
      secretPath: "/",
      name: "services"
    });
  });

  afterEach(async () => {
    // Order matters. A rotation holds a foreign key to the connection, and deleting a project
    // only soft deletes it, leaving the rotation rows in place, so the connection delete would
    // fail on the constraint if the rotations went second. Whatever each test left is read back
    // from the project rather than tracked, so a test that deletes its own rotation needs no
    // bookkeeping here. Neither flag is set: the secrets go with the project and the fake's keys
    // go with the reset.
    const rotations = await listSecretRotations({ projectId, authToken: jwtAuthToken });
    for (const rotation of rotations) {
      // eslint-disable-next-line no-await-in-loop
      await deleteSecretRotation({
        rotationId: rotation.id,
        deleteSecrets: false,
        revokeGeneratedCredentials: false,
        authToken: jwtAuthToken
      });
    }

    await deleteAppConnection({ connectionId, authToken: jwtAuthToken });
    await testServer.inject({
      method: "DELETE",
      url: `/api/v1/projects/${projectId}`,
      headers: { authorization: `Bearer ${jwtAuthToken}` }
    });
  });

  describe("A rotation publishes the new credential and offers the provider the one it displaces", () => {
    test.each([
      {
        mode: FakeIamRotationMode.ReplaceInPlace,
        // Publishing kills the previous credential, so only ever one key exists.
        afterFirstRotation: keyStoreFor(2),
        afterSecondRotation: keyStoreFor(3)
      },
      {
        mode: FakeIamRotationMode.IssueAndDisplace,
        // The previous credential stays usable, and the one before it is the one retired.
        afterFirstRotation: keyStoreFor(1, 2),
        afterSecondRotation: keyStoreFor(2, 3)
      }
    ])(
      "A $mode provider is handed the active and displaced credentials across a create, two rotations and a delete",
      async ({ mode, afterFirstRotation, afterSecondRotation }) => {
        fakeIamUserSecret.setMode(mode);

        const { secretRotation } = await newRotation("lifecycle");
        const rotationId = secretRotation!.id;

        // Creation issues the first credential and writes it to the two mapped keys.
        expect(fakeIamUserSecret.calls()).toEqual([{ fn: "issueCredentials" }]);
        expect(fakeIamUserSecret.keys()).toEqual(keyStoreFor(1));
        expect(await secretsAt("/services")).toEqual(mappedSecretsFor(1));
        expect(secretRotation!.activeIndex).toBe(0);
        // Auto rotation is off, so there is nothing for the cron to pick up. findSecretRotationsToQueue
        // gates on both this and isAutoRotationEnabled.
        expect(secretRotation!.nextRotationAt).toBeNull();

        const first = await rotateSecretRotation({ rotationId, authToken: jwtAuthToken });

        expect(first.secretRotation!.activeIndex).toBe(1);
        expect(first.secretRotation!.rotationStatus).toBe(SecretRotationStatus.Success);
        expect(await secretsAt("/services")).toEqual(mappedSecretsFor(2));
        expect(fakeIamUserSecret.keys()).toEqual(afterFirstRotation);
        // Nothing is displaced on the first rotation: only one slot has ever been filled.
        expect(fakeIamUserSecret.calls().at(-1)).toEqual({
          fn: "rotateCredentials",
          credentialsToRevoke: undefined,
          activeCredentials: credential(1)
        });

        const second = await rotateSecretRotation({ rotationId, authToken: jwtAuthToken });

        expect(second.secretRotation!.activeIndex).toBe(0);
        expect(await secretsAt("/services")).toEqual(mappedSecretsFor(3));
        expect(fakeIamUserSecret.keys()).toEqual(afterSecondRotation);
        // The displaced credential is the one from two rotations ago, never the one the mapped
        // secrets are currently holding.
        expect(fakeIamUserSecret.calls().at(-1)).toEqual({
          fn: "rotateCredentials",
          credentialsToRevoke: credential(1),
          activeCredentials: credential(2)
        });

        // Two slots, newest in the slot activeIndex names.
        expect(await getGeneratedCredentials({ rotationId, authToken: jwtAuthToken })).toEqual({
          generatedCredentials: [credential(3), credential(2)],
          activeIndex: 0
        });

        await deleteSecretRotation({
          rotationId,
          deleteSecrets: true,
          revokeGeneratedCredentials: true,
          authToken: jwtAuthToken
        });

        // Both slots are offered for revocation, in slot order, including the one a
        // replace-in-place provider already retired.
        expect(fakeIamUserSecret.calls().at(-1)).toEqual({
          fn: "revokeCredentials",
          credentials: [credential(3), credential(2)]
        });
        expect(fakeIamUserSecret.keys()).toEqual({});
        expect(await secretsAt("/services")).toEqual({});
        expect(await listSecretRotations({ projectId, authToken: jwtAuthToken })).toEqual([]);
      }
    );
  });

  describe("A rotation that cannot issue a credential changes nothing", () => {
    test("A provider that refuses the first credential leaves no rotation and no secrets", async () => {
      fakeIamUserSecret.failIssueWith("IAM denied CreateAccessKey");

      const { error } = await newRotation("issue-refused", { expectStatusCode: 400 });

      expect(error!.message).toContain("IAM denied CreateAccessKey");
      expect(fakeIamUserSecret.keys()).toEqual({});
      expect(await secretsAt("/services")).toEqual({});
      expect(await listSecretRotations({ projectId, authToken: jwtAuthToken })).toEqual([]);
    });

    test("A provider that refuses a later credential leaves the working one published", async () => {
      const { secretRotation } = await newRotation("issue-refused-later");
      const rotationId = secretRotation!.id;

      fakeIamUserSecret.failIssueWith("IAM throttled CreateAccessKey");

      // A provider failure answers 500 rather than 4xx: rotateSecretRotation wraps whatever
      // rotateGeneratedCredentials threw in an InternalServerError.
      const { error } = await rotateSecretRotation({ rotationId, authToken: jwtAuthToken, expectStatusCode: 500 });
      expect(error!.message).toContain("IAM throttled CreateAccessKey");

      // The credential users hold is untouched, at the provider and in the mapped secrets.
      expect(fakeIamUserSecret.keys()).toEqual(keyStoreFor(1));
      expect(await secretsAt("/services")).toEqual(mappedSecretsFor(1));

      const failed = await getSecretRotation({ rotationId, authToken: jwtAuthToken });
      expect(failed.rotationStatus).toBe(SecretRotationStatus.Failed);
      expect(failed.lastRotationMessage).toContain("IAM throttled CreateAccessKey");
      expect(failed.activeIndex).toBe(0);
    });

    test("A provider that fails after the new credential is published reports failure on a rotation that happened", async () => {
      const { secretRotation } = await newRotation("fails-after-publish");
      const rotationId = secretRotation!.id;

      fakeIamUserSecret.failAfterPersistWith("IAM denied DeleteAccessKey");

      const { error } = await rotateSecretRotation({ rotationId, authToken: jwtAuthToken, expectStatusCode: 500 });
      expect(error!.message).toContain("IAM denied DeleteAccessKey");

      // The write half of the rotation committed before the provider threw, so the new credential
      // is live and published while the rotation reports failed. A provider that retires the
      // displaced credential after publishing rather than before lands here.
      expect(await secretsAt("/services")).toEqual(mappedSecretsFor(2));
      const failed = await getSecretRotation({ rotationId, authToken: jwtAuthToken });
      expect(failed.activeIndex).toBe(1);
      expect(failed.rotationStatus).toBe(SecretRotationStatus.Failed);
    });
  });

  describe("A rotation is created against one free set of secret keys at one existing secret path", () => {
    test("Creating a rotation is refused when the name, the mapped keys or the secret path do not allow it", async () => {
      await newRotation("taken-name");

      const sameName = await newRotation("taken-name", {
        // Different keys, so this can only fail on the name.
        secretsMapping: { accessKeyId: "OTHER_ACCESS_KEY_ID", secretAccessKey: "OTHER_SECRET_ACCESS_KEY" },
        expectStatusCode: 400
      });
      expect(sameName.error!.message).toContain("taken-name");
      expect(sameName.error!.message).toContain("/services");

      await addSecret("/services", "HAND_WRITTEN_KEY", "hand-written-value");
      const takenKey = await newRotation("taken-key", {
        secretsMapping: { accessKeyId: "HAND_WRITTEN_KEY", secretAccessKey: "OTHER_SECRET_ACCESS_KEY" },
        expectStatusCode: 400
      });
      expect(takenKey.error!.message).toContain("HAND_WRITTEN_KEY");

      const missingPath = await newRotation("missing-path", { expectStatusCode: 400 }, "/does/not/exist");
      expect(missingPath.error!.message).toContain("/does/not/exist");
      expect(missingPath.error!.message).toContain(ENV);

      // Only the first rotation was created, and the hand-written secret is still its own.
      expect(await listSecretRotations({ projectId, authToken: jwtAuthToken })).toHaveLength(1);
      expect(await secretsAt("/services")).toEqual({
        ...mappedSecretsFor(1),
        HAND_WRITTEN_KEY: "hand-written-value"
      });
    });
  });

  describe("The rotation owns its mapped secrets until it is deleted", () => {
    test("A mapped secret cannot be given a value by hand", async () => {
      await newRotation("owns-secrets");

      const { error } = await updateSecretV2({
        workspaceId: projectId,
        environmentSlug: ENV,
        secretPath: "/services",
        key: MAPPING.accessKeyId,
        value: "hand-written-value",
        authToken: jwtAuthToken,
        expectStatusCode: 400
      });

      expect(error!.message).toContain("Cannot update rotated secret");
      expect(await secretsAt("/services")).toEqual(mappedSecretsFor(1));
    });

    test("Deleting a rotation without revoking or deleting leaves the credential live and the secrets editable", async () => {
      const { secretRotation } = await newRotation("leaves-everything");

      await deleteSecretRotation({
        rotationId: secretRotation!.id,
        deleteSecrets: false,
        revokeGeneratedCredentials: false,
        authToken: jwtAuthToken
      });

      // The provider was never asked to revoke anything, so the credential still works. This is
      // the escape hatch for a rotation whose credential is in use elsewhere.
      expect(fakeIamUserSecret.calls().some((call) => call.fn === "revokeCredentials")).toBe(false);
      expect(fakeIamUserSecret.keys()).toEqual(keyStoreFor(1));
      expect(await secretsAt("/services")).toEqual(mappedSecretsFor(1));

      // Nothing owns the secrets now, so the write the previous test was refused succeeds.
      await updateSecretV2({
        workspaceId: projectId,
        environmentSlug: ENV,
        secretPath: "/services",
        key: MAPPING.accessKeyId,
        value: "hand-written-value",
        authToken: jwtAuthToken
      });

      expect((await secretsAt("/services"))[MAPPING.accessKeyId]).toBe("hand-written-value");
    });
  });

  describe("A credential check reports what the provider says about the active credential", () => {
    test("A credential revoked at the provider fails the check", async () => {
      const { secretRotation } = await newRotation("check-credentials");
      const rotationId = secretRotation!.id;

      await checkRotationCredentials({ rotationId, authToken: jwtAuthToken });

      fakeIamUserSecret.revokeOutOfBand(credential(1).accessKeyId);

      const error = await checkRotationCredentials({ rotationId, authToken: jwtAuthToken, expectStatusCode: 400 });

      expect(error!.message).toContain(credential(1).accessKeyId);
      // The check reports, it does not repair: the rotation still holds the dead credential.
      expect(await secretsAt("/services")).toEqual(mappedSecretsFor(1));
    });
  });
});
