import { describe, expect, test, vi } from "vitest";

import type { TActorContext } from "@app/domains/lib/actor-context";
import { ActorType } from "@app/lib/auth/actor-types";

import { certificateInventoryViewServiceFactory } from "./certificate-inventory-view-service";

const PROJECT_ID = "project-1";
const USER_ID = "user-1";

const actor = {
  principal: { type: ActorType.USER, id: USER_ID },
  org: { id: "org-1" }
} as unknown as TActorContext;

const buildService = () => {
  const findByProjectId = vi.fn(async () => []);
  const allow = { assert: vi.fn() };
  const service = certificateInventoryViewServiceFactory({
    certificateInventoryViewDAL: { findByProjectId },
    pkiApplicationDAL: { findById: vi.fn() },
    projectPermissionService: { getProjectPermission: vi.fn(async () => allow) },
    applicationPermissionService: { getApplicationPermission: vi.fn(async () => allow) }
  } as unknown as Parameters<typeof certificateInventoryViewServiceFactory>[0]);
  return { service, findByProjectId };
};

describe("certificateInventoryViewService.listViews", () => {
  test("should list the project's views for the actor, without an application", async () => {
    // Setup
    const { service, findByProjectId } = buildService();

    // Action
    await service.listViews({ projectId: PROJECT_ID, actor });

    // Assert
    expect(findByProjectId).toHaveBeenCalledWith(PROJECT_ID, USER_ID, undefined);
  });

  test("should list an application's views for the actor", async () => {
    // Setup
    const { service, findByProjectId } = buildService();

    // Action
    await service.listViews({ projectId: PROJECT_ID, applicationId: "app-1", actor });

    // Assert
    expect(findByProjectId).toHaveBeenCalledWith(PROJECT_ID, USER_ID, "app-1");
  });
});
