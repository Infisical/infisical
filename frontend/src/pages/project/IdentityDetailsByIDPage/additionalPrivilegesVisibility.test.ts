import assert from "node:assert/strict";
import { describe, it } from "vitest";

import { ProjectType } from "@app/hooks/api/projects/types";

import { shouldShowLegacyAdditionalPrivileges } from "./additionalPrivilegesVisibility";

describe("Legacy additional privileges visibility", () => {
  it("shows privileges for legacy Secret Manager projects", () => {
    assert.equal(shouldShowLegacyAdditionalPrivileges(ProjectType.SecretManager, true), true);
  });

  it("hides privileges when legacy mode is disabled", () => {
    assert.equal(shouldShowLegacyAdditionalPrivileges(ProjectType.SecretManager, false), false);
  });

  it.each([ProjectType.CertificateManager, ProjectType.PAM, ProjectType.AgentVault])(
    "hides privileges for standalone product %s",
    (type) => {
      assert.equal(shouldShowLegacyAdditionalPrivileges(type, true), false);
    }
  );
});
