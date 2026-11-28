import { randomUUID } from "node:crypto";

import { ProjectType } from "@app/db/schemas";
import { PermissionDeniedError, RuleViolationError } from "@app/domains/lib/errors";

import { Project } from "./project";

const project = (type = ProjectType.SecretManager) =>
  Project.restore({ id: randomUUID(), name: "payments", slug: "payments", orgId: "org-a", type });

describe("Project.assertUsableBy", () => {
  test("should refuse a project of another org with the legacy message", () => {
    // Setup
    const payments = project();

    // Action
    const result = () => payments.assertUsableBy({ orgId: "org-b" });

    // Assert
    expect(result).toThrow(PermissionDeniedError);
    expect(result).toThrow("This project does not belong to your selected organization.");
  });

  test("should refuse a check for another product's project type with the legacy message", () => {
    // Setup
    const payments = project(ProjectType.SecretManager);

    // Action
    const result = () => payments.assertUsableBy({ orgId: "org-a", type: ProjectType.PAM });

    // Assert
    expect(result).toThrow(RuleViolationError);
    expect(result).toThrow(
      `The project is of type ${ProjectType.SecretManager}. Operations of type ${ProjectType.PAM} are not allowed.`
    );
  });

  test("should refuse another org before checking the type", () => {
    // Setup
    const payments = project(ProjectType.SecretManager);

    // Action
    const result = () => payments.assertUsableBy({ orgId: "org-b", type: ProjectType.PAM });

    // Assert
    expect(result).toThrow(PermissionDeniedError);
  });

  test("should allow its own org, with its own type or none", () => {
    // Setup
    const payments = project(ProjectType.KMS);

    // Action
    const result = () => {
      payments.assertUsableBy({ orgId: "org-a" });
      payments.assertUsableBy({ orgId: "org-a", type: ProjectType.KMS });
    };

    // Assert
    expect(result).not.toThrow();
  });
});
