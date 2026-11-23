import { describe, expect, test } from "vitest";

import { findDroppedDenySubjects, PROJECT_SUBJECTS_WITHOUT_DENY } from "./dropped-deny-fns";
import { ProjectPermissionSub } from "./project-permission";

describe("findDroppedDenySubjects", () => {
  test("names a deny on a subject whose schema can't keep it, and leaves out one that can", () => {
    expect(PROJECT_SUBJECTS_WITHOUT_DENY.has(ProjectPermissionSub.Role)).toBe(true);
    expect(PROJECT_SUBJECTS_WITHOUT_DENY.has(ProjectPermissionSub.AgentVaultServices)).toBe(false);
    expect(
      findDroppedDenySubjects([
        { subject: ProjectPermissionSub.Role, action: ["edit"], inverted: true },
        { subject: ProjectPermissionSub.Role, action: ["read"] },
        { subject: ProjectPermissionSub.AgentVaultServices, action: ["use"], inverted: true },
        { subject: ProjectPermissionSub.Settings, action: ["edit"], inverted: false }
      ])
    ).toEqual([ProjectPermissionSub.Role]);
    expect(findDroppedDenySubjects(undefined)).toEqual([]);
  });
});
