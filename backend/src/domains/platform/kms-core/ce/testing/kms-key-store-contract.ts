import { randomUUID } from "node:crypto";

import { ProjectType } from "@app/db/schemas";
import { AsymmetricKeyAlgorithm } from "@app/lib/crypto/sign";
import { OrderByDirection } from "@app/lib/types";

import { KeyMaterial, KmsKeyUsage } from "../models/key-material";
import { KmsKey } from "../models/kms-key";
import { RootKey } from "../models/root-key";
import { TKmsKeyStore, TKmsKeyVersionStore } from "../services/dependencies";

// Organizations and projects belong to no store here, so each backend creates them its own way.
export type TKmsKeyStoreFixture = {
  keyStore: TKmsKeyStore;
  versionStore: TKmsKeyVersionStore;
  newOrg: () => Promise<string>;
  newProject: (orgId: string, options?: { type?: ProjectType; pendingDeletion?: boolean }) => Promise<string>;
};

export const rootKeyForTests = RootKey.generate();

type TInternalOverrides = Partial<Parameters<typeof KmsKey.createInternal>[0]>;

export const newInternalKey = (orgId: string, overrides: TInternalOverrides = {}) =>
  KmsKey.createInternal({
    orgId,
    name: "customer-key",
    material: KeyMaterial.generateSymmetric(),
    rootKey: rootKeyForTests,
    isReserved: false,
    ...overrides
  });

export const newExternalKey = (orgId: string, overrides: Partial<Parameters<typeof KmsKey.createExternal>[0]> = {}) =>
  KmsKey.createExternal({
    orgId,
    name: "aws-key",
    provider: "aws",
    encryptedProviderInputs: Buffer.from("encrypted-inputs"),
    ...overrides
  });

const ids = (keys: KmsKey[]) => keys.map((key) => key.id).sort();

export const describeKmsKeyStoreContract = (name: string, setup: () => Promise<TKmsKeyStoreFixture>) => {
  describe(`KmsKeyStore contract (${name})`, () => {
    describe("insert and findById", () => {
      test("should store an internal key with its material and read it back", async () => {
        // Setup
        const { keyStore, newOrg, newProject } = await setup();
        const orgId = await newOrg();
        const projectId = await newProject(orgId);
        const key = newInternalKey(orgId, {
          projectId,
          description: "d",
          isExportable: false,
          hasDeleteProtection: true
        });

        // Action
        await keyStore.insert(key);
        const found = await keyStore.findById(key.id);

        // Assert
        const { createdAt, updatedAt, ...expected } = key.toJSON();
        expect(found?.toJSON()).toMatchObject(expected);
        expect(found?.isExternal).toBe(false);
      });

      test("should store an external key with its provider config and read it back", async () => {
        // Setup
        const { keyStore, newOrg } = await setup();
        const orgId = await newOrg();
        const key = newExternalKey(orgId);

        // Action
        await keyStore.insert(key);
        const found = await keyStore.findById(key.id);

        // Assert
        expect(found?.isExternal).toBe(true);
        expect(found?.toJSON().internal).toBeNull();
        expect(found?.toJSON().external).toMatchObject({
          provider: "aws",
          encryptedProviderInputs: Buffer.from("encrypted-inputs")
        });
      });

      test("should refuse a second key with the same name in a project", async () => {
        // Setup
        const { keyStore, newOrg, newProject } = await setup();
        const orgId = await newOrg();
        const projectId = await newProject(orgId);
        await keyStore.insert(newInternalKey(orgId, { projectId, name: "taken" }));
        const duplicate = newInternalKey(orgId, { projectId, name: "taken" });

        // Action
        const result = keyStore.insert(duplicate);

        // Assert
        await expect(result).rejects.toThrow();
        expect(await keyStore.findById(duplicate.id)).toBeNull();
      });

      test("should allow one name in different projects and on several org-level keys", async () => {
        // Setup
        const { keyStore, newOrg, newProject } = await setup();
        const orgId = await newOrg();
        const [first, second] = [await newProject(orgId), await newProject(orgId)];
        const keys = [
          newInternalKey(orgId, { projectId: first, name: "shared" }),
          newInternalKey(orgId, { projectId: second, name: "shared" }),
          newInternalKey(orgId, { name: "shared" }),
          newInternalKey(orgId, { name: "shared" })
        ];

        // Action
        const result = Promise.all(keys.map((key) => keyStore.insert(key)));

        // Assert
        await expect(result).resolves.toBeDefined();
        expect(ids(await keyStore.find({ orgId, name: "shared" }))).toEqual(ids(keys));
      });

      test("should return null for a key that does not exist", async () => {
        // Setup
        const { keyStore } = await setup();

        // Action
        const found = await keyStore.findById(randomUUID());

        // Assert
        expect(found).toBeNull();
      });
    });

    describe("find", () => {
      const seed = async () => {
        const fixture = await setup();
        const orgId = await fixture.newOrg();
        const otherOrgId = await fixture.newOrg();
        const projectId = await fixture.newProject(orgId);
        const orgLevel = newInternalKey(orgId, { name: "org-level", isReserved: true });
        const projectKey = newInternalKey(orgId, { name: "project-key", projectId });
        const reservedKey = newInternalKey(orgId, { name: "reserved-key", projectId, isReserved: true });
        const signKey = newInternalKey(orgId, {
          name: "sign-key",
          projectId,
          material: await KeyMaterial.generate(KmsKeyUsage.SIGN_VERIFY, AsymmetricKeyAlgorithm.ED25519)
        });
        const external = newExternalKey(orgId);
        const foreign = newInternalKey(otherOrgId, { name: "foreign" });
        const all = [orgLevel, projectKey, reservedKey, signKey, external, foreign];
        await Promise.all(all.map((key) => fixture.keyStore.insert(key)));
        return { ...fixture, orgId, projectId, orgLevel, projectKey, reservedKey, signKey, external, foreign };
      };

      test("should include every key when no filter is set", async () => {
        // Setup
        const { keyStore, orgLevel, projectKey, reservedKey, signKey, external, foreign } = await seed();

        // Action
        const found = await keyStore.find({});

        // Assert
        expect(ids(found)).toEqual(
          expect.arrayContaining(ids([orgLevel, projectKey, reservedKey, signKey, external, foreign]))
        );
      });

      test("should match nothing for an empty string filter instead of ignoring it", async () => {
        // Setup
        const { keyStore, orgId } = await seed();

        // Action
        const found = await Promise.all([
          keyStore.find({ id: "" }),
          keyStore.find({ name: "" }),
          keyStore.find({ keyUsage: "" }),
          keyStore.find({ orgId: "" }),
          keyStore.find({ orgId, projectId: "" })
        ]);

        // Assert
        expect(found.map((keys) => keys.length)).toEqual([0, 0, 0, 0, 0]);
      });

      test("should match nothing for an empty id list", async () => {
        // Setup
        const { keyStore } = await seed();

        // Action
        const found = await keyStore.find({ ids: [] });

        // Assert
        expect(found).toEqual([]);
      });

      test("should filter by id list and ignore ids it does not hold", async () => {
        // Setup
        const { keyStore, orgLevel, external } = await seed();

        // Action
        const found = await keyStore.find({ ids: [orgLevel.id, external.id, randomUUID()] });

        // Assert
        expect(ids(found)).toEqual(ids([orgLevel, external]));
      });

      test("should filter by org, treating a null project as org-level keys only", async () => {
        // Setup
        const { keyStore, orgId, orgLevel, external } = await seed();

        // Action
        const found = await keyStore.find({ orgId, projectId: null });

        // Assert
        expect(ids(found)).toEqual(ids([orgLevel, external]));
      });

      test("should filter by project, name, reserved flag and usage", async () => {
        // Setup
        const { keyStore, orgId, projectId, projectKey, reservedKey, signKey } = await seed();

        // Action
        const [byProject, byName, reserved, customer, byUsage] = await Promise.all([
          keyStore.find({ projectId }),
          keyStore.find({ orgId, name: "project-key" }),
          keyStore.find({ projectId, isReserved: true }),
          keyStore.find({ projectId, isReserved: false }),
          keyStore.find({ projectId, keyUsage: KmsKeyUsage.SIGN_VERIFY })
        ]);

        // Assert
        expect(ids(byProject)).toEqual(ids([projectKey, reservedKey, signKey]));
        expect(ids(byName)).toEqual([projectKey.id]);
        expect(ids(reserved)).toEqual([reservedKey.id]);
        expect(ids(customer)).toEqual(ids([projectKey, signKey]));
        expect(ids(byUsage)).toEqual([signKey.id]);
      });

      test("should filter external keys in either direction", async () => {
        // Setup
        const { keyStore, orgId, orgLevel, projectKey, reservedKey, signKey, external } = await seed();

        // Action
        const [onlyExternal, onlyInternal] = await Promise.all([
          keyStore.find({ orgId, isExternal: true }),
          keyStore.find({ orgId, isExternal: false })
        ]);

        // Assert
        expect(ids(onlyExternal)).toEqual([external.id]);
        expect(ids(onlyInternal)).toEqual(ids([orgLevel, projectKey, reservedKey, signKey]));
      });
    });

    describe("findForUpdate and findForRotation", () => {
      test("should return the key, and null for one that does not exist", async () => {
        // Setup
        const { keyStore, newOrg } = await setup();
        const key = newInternalKey(await newOrg());
        await keyStore.insert(key);

        // Action
        const found = await Promise.all([
          keyStore.findForUpdate(key.id),
          keyStore.findForRotation(key.id),
          keyStore.findForUpdate(randomUUID()),
          keyStore.findForRotation(randomUUID())
        ]);

        // Assert
        expect(found.map((result) => result?.id ?? null)).toEqual([key.id, key.id, null, null]);
      });
    });

    describe("save", () => {
      test("should persist attribute changes", async () => {
        // Setup
        const { keyStore, newOrg } = await setup();
        const key = newInternalKey(await newOrg(), { isExportable: true });
        await keyStore.insert(key);
        const loaded = (await keyStore.findForUpdate(key.id)) as KmsKey;
        loaded.rename("renamed");
        loaded.describe("now described");
        loaded.disable();
        loaded.protect();
        loaded.forbidExport();
        loaded.publishPublicKey();
        loaded.setKmipMetadata({ kmipId: "1" });

        // Action
        await keyStore.save(loaded);

        // Assert
        const { createdAt, updatedAt, ...saved } = ((await keyStore.findById(key.id)) as KmsKey).toJSON();
        expect(saved).toMatchObject({
          name: "renamed",
          description: "now described",
          isDisabled: true,
          hasDeleteProtection: true,
          isExportable: false,
          isPublicKeyPublished: true,
          kmipMetadata: { kmipId: "1" }
        });
      });

      test("should refuse a rename to a name another key of the project holds", async () => {
        // Setup
        const { keyStore, newOrg, newProject } = await setup();
        const orgId = await newOrg();
        const projectId = await newProject(orgId);
        const other = newInternalKey(orgId, { projectId, name: "other" });
        const key = newInternalKey(orgId, { projectId, name: "mine" });
        await Promise.all([other, key].map((candidate) => keyStore.insert(candidate)));
        const loaded = (await keyStore.findForUpdate(key.id)) as KmsKey;
        loaded.rename("other");

        // Action
        const result = keyStore.save(loaded);

        // Assert
        await expect(result).rejects.toThrow();
        expect(((await keyStore.findById(key.id)) as KmsKey).name).toBe("mine");
      });

      test("should persist a rotation's new material and version", async () => {
        // Setup
        const { keyStore, versionStore, newOrg } = await setup();
        const key = newInternalKey(await newOrg());
        await keyStore.insert(key);
        const loaded = (await keyStore.findForRotation(key.id)) as KmsKey;
        const archived = loaded.rotate(rootKeyForTests);

        // Action
        await versionStore.insert(archived);
        await keyStore.save(loaded);

        // Assert
        const stored = ((await keyStore.findById(key.id)) as KmsKey).toJSON();
        expect(stored.internal).toEqual(loaded.toJSON().internal);
        expect(stored.internal?.version).toBe(2);
        expect(stored.internal?.encryptedKey).not.toEqual(key.toJSON().internal?.encryptedKey);
      });

      test("should persist an external key's new provider inputs", async () => {
        // Setup
        const { keyStore, newOrg } = await setup();
        const key = newExternalKey(await newOrg());
        await keyStore.insert(key);
        const loaded = (await keyStore.findForUpdate(key.id)) as KmsKey;
        loaded.replaceProviderInputs(Buffer.from("new-inputs"));

        // Action
        await keyStore.save(loaded);

        // Assert
        const stored = ((await keyStore.findById(key.id)) as KmsKey).toJSON();
        expect(stored.external?.encryptedProviderInputs).toEqual(Buffer.from("new-inputs"));
      });
    });

    describe("delete and deleteMany", () => {
      test("should remove a key with its archived versions", async () => {
        // Setup
        const { keyStore, versionStore, newOrg } = await setup();
        const key = newInternalKey(await newOrg());
        await keyStore.insert(key);
        const loaded = (await keyStore.findForRotation(key.id)) as KmsKey;
        await versionStore.insert(loaded.rotate(rootKeyForTests));
        await keyStore.save(loaded);
        const internalKmsId = loaded.toJSON().internal?.id as string;

        // Action
        await keyStore.delete(key.id);

        // Assert
        expect(await keyStore.findById(key.id)).toBeNull();
        expect(await versionStore.listByInternalKmsId(internalKmsId)).toEqual([]);
      });

      test("should not fail when the key does not exist", async () => {
        // Setup
        const { keyStore } = await setup();

        // Action
        const result = keyStore.delete(randomUUID());

        // Assert
        await expect(result).resolves.toBeUndefined();
      });

      test("should remove the keys it holds and count them", async () => {
        // Setup
        const { keyStore, newOrg } = await setup();
        const orgId = await newOrg();
        const first = newInternalKey(orgId, { name: "first" });
        const second = newInternalKey(orgId, { name: "second" });
        const kept = newInternalKey(orgId, { name: "kept" });
        await Promise.all([first, second, kept].map((key) => keyStore.insert(key)));

        // Action
        const removed = await keyStore.deleteMany([first.id, second.id, randomUUID()]);

        // Assert
        expect(removed).toBe(2);
        expect(ids(await keyStore.find({ orgId }))).toEqual([kept.id]);
      });

      test("should remove nothing for an empty list", async () => {
        // Setup
        const { keyStore } = await setup();

        // Action
        const removed = await keyStore.deleteMany([]);

        // Assert
        expect(removed).toBe(0);
      });
    });

    describe("findPublishedById", () => {
      const publishedKey = async (options: { pendingDeletion?: boolean; published?: boolean } = {}) => {
        const fixture = await setup();
        const orgId = await fixture.newOrg();
        const projectId = await fixture.newProject(orgId, { pendingDeletion: options.pendingDeletion });
        const key = newInternalKey(orgId, { projectId, isPublicKeyPublished: options.published ?? true });
        await fixture.keyStore.insert(key);
        return { ...fixture, key };
      };

      test("should return a published key of a live project", async () => {
        // Setup
        const { keyStore, key } = await publishedKey();

        // Action
        const found = await keyStore.findPublishedById(key.id);

        // Assert
        expect(found?.id).toBe(key.id);
      });

      test("should return null for a key that is not published", async () => {
        // Setup
        const { keyStore, key } = await publishedKey({ published: false });

        // Action
        const found = await keyStore.findPublishedById(key.id);

        // Assert
        expect(found).toBeNull();
      });

      test("should return null when the project is pending deletion", async () => {
        // Setup
        const { keyStore, key } = await publishedKey({ pendingDeletion: true });

        // Action
        const found = await keyStore.findPublishedById(key.id);

        // Assert
        expect(found).toBeNull();
      });

      test("should return null for an org-level key and for one that does not exist", async () => {
        // Setup
        const { keyStore, newOrg } = await setup();
        const orgLevel = newInternalKey(await newOrg(), { isPublicKeyPublished: true });
        await keyStore.insert(orgLevel);

        // Action
        const found = await Promise.all([
          keyStore.findPublishedById(orgLevel.id),
          keyStore.findPublishedById(randomUUID())
        ]);

        // Assert
        expect(found).toEqual([null, null]);
      });
    });

    describe("listProjectKeys", () => {
      const seedProject = async () => {
        const fixture = await setup();
        const orgId = await fixture.newOrg();
        const projectId = await fixture.newProject(orgId);
        const otherProjectId = await fixture.newProject(orgId);
        const [alpha, bravo, charlie] = ["alpha", "bravo", "charlie"].map((keyName) =>
          newInternalKey(orgId, { name: keyName, projectId })
        );
        const reserved = newInternalKey(orgId, { name: "reserved", projectId, isReserved: true });
        const elsewhere = newInternalKey(orgId, { name: "elsewhere", projectId: otherProjectId });
        await Promise.all([alpha, bravo, charlie, reserved, elsewhere].map((key) => fixture.keyStore.insert(key)));
        return { ...fixture, projectId, alpha, bravo, charlie };
      };

      test("should list the project's customer keys only, ordered by name", async () => {
        // Setup
        const { keyStore, projectId, alpha, bravo, charlie } = await seedProject();

        // Action
        const page = await keyStore.listProjectKeys({
          projectId,
          offset: 0,
          orderBy: "name",
          orderDirection: OrderByDirection.DESC
        });

        // Assert
        expect(page.keys.map((key) => key.id)).toEqual([charlie.id, bravo.id, alpha.id]);
        expect(page.totalCount).toBe(3);
      });

      test("should return one page with the total of all of them", async () => {
        // Setup
        const { keyStore, projectId, bravo } = await seedProject();

        // Action
        const page = await keyStore.listProjectKeys({
          projectId,
          offset: 1,
          limit: 1,
          orderBy: "name",
          orderDirection: OrderByDirection.ASC
        });

        // Assert
        expect(page.keys.map((key) => key.id)).toEqual([bravo.id]);
        expect(page.totalCount).toBe(3);
      });

      test("should keep the total when the page is past the last key", async () => {
        // Setup
        const { keyStore, projectId } = await seedProject();

        // Action
        const page = await keyStore.listProjectKeys({
          projectId,
          offset: 10,
          limit: 5,
          orderBy: "name",
          orderDirection: OrderByDirection.ASC
        });

        // Assert
        expect(page).toEqual({ keys: [], totalCount: 3 });
      });

      test("should search by name or id, ignoring case", async () => {
        // Setup
        const { keyStore, projectId, charlie } = await seedProject();

        // Action
        const [byName, byId] = await Promise.all(
          ["CHAR", charlie.id.slice(0, 13).toUpperCase()].map((search) =>
            keyStore.listProjectKeys({
              projectId,
              offset: 0,
              orderBy: "name",
              orderDirection: OrderByDirection.ASC,
              search
            })
          )
        );

        // Assert
        expect(byName.keys.map((key) => key.id)).toEqual([charlie.id]);
        expect(byId.keys.map((key) => key.id)).toEqual([charlie.id]);
      });

      test("should leave out external keys", async () => {
        // Setup
        const { keyStore, newOrg, newProject } = await setup();
        const orgId = await newOrg();
        const projectId = await newProject(orgId);
        const external = newExternalKey(orgId);
        await keyStore.insert(external);

        // Action
        const page = await keyStore.listProjectKeys({
          projectId,
          offset: 0,
          orderBy: "name",
          orderDirection: OrderByDirection.ASC
        });

        // Assert
        expect(page).toEqual({ keys: [], totalCount: 0 });
      });
    });

    describe("countProjectKeysInOrg", () => {
      test("should count keys of the org's live projects of the type, including reserved ones", async () => {
        // Setup
        const { keyStore, newOrg, newProject } = await setup();
        const orgId = await newOrg();
        const otherOrgId = await newOrg();
        const live = await newProject(orgId, { type: ProjectType.KMS });
        const sameTypeToo = await newProject(orgId, { type: ProjectType.KMS });
        const wrongType = await newProject(orgId, { type: ProjectType.SecretManager });
        const pending = await newProject(orgId, { type: ProjectType.KMS, pendingDeletion: true });
        const foreign = await newProject(otherOrgId, { type: ProjectType.KMS });
        const keys = [
          newInternalKey(orgId, { name: "a", projectId: live }),
          newInternalKey(orgId, { name: "b", projectId: live, isReserved: true }),
          newInternalKey(orgId, { name: "c", projectId: sameTypeToo }),
          newInternalKey(orgId, { name: "d", projectId: wrongType }),
          newInternalKey(orgId, { name: "e", projectId: pending }),
          newInternalKey(otherOrgId, { name: "f", projectId: foreign }),
          newInternalKey(orgId, { name: "g" })
        ];
        await Promise.all(keys.map((key) => keyStore.insert(key)));

        // Action
        const count = await keyStore.countProjectKeysInOrg(orgId, ProjectType.KMS);

        // Assert
        expect(count).toBe(3);
      });
    });
  });
};
