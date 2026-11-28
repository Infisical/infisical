import { KMS_LOCK_IDS } from "./kms-core-locks";

describe("KMS_LOCK_IDS", () => {
  test("should keep the root key lock id of the previous release", () => {
    // Setup
    const expected = 2025;

    // Action
    const id = KMS_LOCK_IDS.rootKey;

    // Assert
    expect(id).toBe(expected);
  });

  test("should keep the lock ids the previous release derives for an organization", () => {
    // Setup
    const orgId = "org-1";

    // Action
    const ids = [KMS_LOCK_IDS.orgKey(orgId), KMS_LOCK_IDS.orgDataKey(orgId)];

    // Assert
    expect(ids).toEqual([1497779260, 1119392583]);
  });

  test("should keep the lock ids the previous release derives for a project", () => {
    // Setup
    const projectId = "project-1";

    // Action
    const ids = [KMS_LOCK_IDS.projectKey(projectId), KMS_LOCK_IDS.projectDataKey(projectId)];

    // Assert
    expect(ids).toEqual([379668412, 2066476967]);
  });
});
