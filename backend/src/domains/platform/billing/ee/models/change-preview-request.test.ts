import { RuleViolationError } from "@app/domains/lib/errors";

import { ChangePreviewRequest } from "./change-preview-request";

describe("ChangePreviewRequest.create", () => {
  test("should refuse a request that changes nothing, including an empty commitment list", () => {
    // Setup
    const empty = {};
    const emptyCommitments = { commitmentChanges: [] };

    // Action
    const results = [() => ChangePreviewRequest.create(empty), () => ChangePreviewRequest.create(emptyCommitments)];

    // Assert
    results.forEach((result) => {
      expect(result).toThrow(RuleViolationError);
      expect(result).toThrow("Provide a product to add, remove or upgrade, or a commitment change");
    });
  });

  test("should refuse an upgrade without the plan to upgrade to", () => {
    // Setup
    const record = { upgradeProductId: "secrets" };

    // Action
    const result = () => ChangePreviewRequest.create(record);

    // Assert
    expect(result).toThrow(RuleViolationError);
    expect(result).toThrow("Provide the plan to upgrade to");
  });

  test.each([{ addProductId: "secrets" }, { removeProductId: "secrets" }])(
    "should refuse a plan change combined with adding or removing the same product (%o)",
    (extra) => {
      // Setup
      const record = { upgradeProductId: "secrets", upgradePlan: "pro", ...extra };

      // Action
      const result = () => ChangePreviewRequest.create(record);

      // Assert
      expect(result).toThrow(RuleViolationError);
      expect(result).toThrow("A plan change cannot be combined with adding or removing the same product");
    }
  );

  test("should allow a plan change alongside a different product being added", () => {
    // Setup
    const record = { upgradeProductId: "secrets", upgradePlan: "pro", addProductId: "pam" };

    // Action
    const request = ChangePreviewRequest.create(record);

    // Assert
    expect(request.upgrade).toEqual({ productId: "secrets", plan: "pro" });
    expect(request.addProductId).toBe("pam");
  });

  test("should expose the remove and commitment changes of a valid request, and none when absent", () => {
    // Setup
    const changes = [{ dimensionKey: "identities", quantity: 50 }];
    const full = ChangePreviewRequest.create({ removeProductId: "pam", commitmentChanges: changes });
    const addOnly = ChangePreviewRequest.create({ addProductId: "pam" });

    // Action
    const result = [full.removeProductIds, full.commitmentChanges, addOnly.removeProductIds, addOnly.commitmentChanges];

    // Assert
    expect(result).toEqual([["pam"], changes, undefined, undefined]);
  });
});
