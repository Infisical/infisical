import { ProjectType } from "@app/db/schemas";
import { PermissionDeniedError, RuleViolationError } from "@app/domains/lib/errors";
import {
  Project,
  ProjectPermissionSecretActions,
  ProjectPermissionSub
} from "@app/domains/platform/projects/ce/module";

import { ServiceToken } from "./service-token";

const project = (overrides: { orgId?: string; type?: ProjectType } = {}) =>
  Project.restore({
    id: "project-id",
    name: "p",
    slug: "p",
    orgId: overrides.orgId ?? "org-id",
    type: overrides.type ?? ProjectType.SecretManager,
    enforceEncryptedSecretManagerSecretMetadata: false
  });

const token = () =>
  ServiceToken.restore({
    id: "token-id",
    projectId: "project-id",
    scopes: [{ environment: "prod", secretPath: "/app" }],
    permissions: ["read"]
  });

describe("ServiceToken.assertUsableIn", () => {
  test("should return the token's project when used in it, in its org", () => {
    // Setup
    const own = project();

    // Action
    const usable = token().assertUsableIn({ project: own, projectId: "project-id", orgId: "org-id" });

    // Assert
    expect(usable).toBe(own);
  });

  test("should refuse a token whose project is gone before anything else", () => {
    // Setup
    const orphan = token();

    // Action
    const use = () => orphan.assertUsableIn({ project: null, projectId: "other-project", orgId: "other-org" });

    // Assert
    expect(use).toThrow(RuleViolationError);
    expect(use).toThrow("Service token not linked to a project");
  });

  test("should refuse a token used in another project, then in another org", () => {
    // Setup
    const own = project({ orgId: "org-id" });

    // Action
    const otherProject = () => token().assertUsableIn({ project: own, projectId: "other-project", orgId: "other-org" });
    const otherOrg = () => token().assertUsableIn({ project: own, projectId: "project-id", orgId: "other-org" });

    // Assert
    expect(otherProject).toThrow(PermissionDeniedError);
    expect(otherProject).toThrow("Service token not a part of the specified project with ID other-project");
    expect(otherOrg).toThrow(PermissionDeniedError);
    expect(otherOrg).toThrow("Service token not a part of the specified organization with ID other-org");
  });

  test("should refuse a token whose project is not a Secret Manager project", () => {
    // Setup
    const kms = project({ type: ProjectType.KMS });

    // Action
    const use = () => token().assertUsableIn({ project: kms, projectId: "project-id", orgId: "org-id" });

    // Assert
    expect(use).toThrow(RuleViolationError);
    expect(use).toThrow(
      `The project is of type ${ProjectType.KMS}. Operations of type secret-manager are not allowed.`
    );
  });
});

describe("ServiceToken.toPermission", () => {
  test("should grant the combined read action at its scopes only", () => {
    // Setup
    const own = project();

    // Action
    const permission = token().toPermission({ project: own, usesNewPrivilegeSystem: false });

    // Assert
    const readAt = (secretPath: string) =>
      permission.can({
        action: ProjectPermissionSecretActions.DescribeAndReadValue,
        subject: ProjectPermissionSub.Secrets,
        fields: { environment: "prod", secretPath }
      });
    expect(readAt("/app")).toBe(true);
    expect(readAt("/other")).toBe(false);
    expect(
      permission.can({
        action: ProjectPermissionSecretActions.Edit,
        subject: ProjectPermissionSub.Secrets,
        fields: { environment: "prod", secretPath: "/app" }
      })
    ).toBe(false);
  });
});
