import { describe, expect, test, vi } from "vitest";

import { ProjectMembershipRole, ProjectType } from "@app/db/schemas";
import type { TActorContext } from "@app/domains/lib/actor-context";
import { Permission } from "@app/domains/platform/access-control/ce/module";
import {
  ProjectPermissionActions,
  ProjectPermissionMemberActions,
  ProjectPermissionSub
} from "@app/domains/platform/projects/ce/module";
import { ActorType } from "@app/lib/auth/actor-types";

import { projectServiceFactory } from "./project-service";

vi.mock("@app/lib/config/env", () => ({ getConfig: () => ({ SITE_URL: "https://app.example.com" }) }));

const actor = {
  principal: { type: ActorType.USER, id: "requester" },
  org: { id: "org-1" }
} as unknown as TActorContext;

const member = (email: string, roles: { role: string; customRoleSlug?: string }[]) => ({
  userId: email,
  user: { email },
  roles
});

const setup = () => {
  const sendMail = vi.fn();
  const service = projectServiceFactory({
    projectDAL: {
      findById: vi.fn(async () => ({
        id: "project-1",
        orgId: "org-1",
        name: "Payments",
        type: ProjectType.SecretManager
      }))
    },
    orgPermissionService: {
      getOrgPermission: vi.fn(async () =>
        Permission.fromRules({ rules: [{ action: "request-access", subject: "project" }] })
      )
    },
    projectPermissionService: {
      getProjectPermission: vi.fn(async () => {
        throw new Error("not a member");
      }),
      getProjectPermissionByRoles: vi.fn(async () => [
        {
          role: { name: "Inviter", slug: "inviter" },
          permission: Permission.fromRules({
            rules: [{ action: ProjectPermissionMemberActions.Create, subject: ProjectPermissionSub.Member }]
          })
        },
        {
          role: { name: "Reader", slug: "reader" },
          permission: Permission.fromRules({
            rules: [{ action: ProjectPermissionActions.Read, subject: ProjectPermissionSub.Secrets }]
          })
        }
      ])
    },
    projectMembershipDAL: {
      findAllProjectMembers: vi.fn(async () => [
        member("inviter@example.com", [{ role: ProjectMembershipRole.Custom, customRoleSlug: "inviter" }]),
        member("reader@example.com", [{ role: ProjectMembershipRole.Custom, customRoleSlug: "reader" }])
      ])
    },
    roleDAL: { find: vi.fn(async () => [{ slug: "inviter" }, { slug: "reader" }]) },
    orgDAL: { findOne: vi.fn(async () => ({ name: "Acme" })) },
    userDAL: { findById: vi.fn(async () => ({ email: "requester@example.com", firstName: "R", lastName: "Q" })) },
    projectAccessRequestDAL: { upsertPendingRequest: vi.fn() },
    notificationService: { createUserNotifications: vi.fn() },
    smtpService: { sendMail }
  } as unknown as Parameters<typeof projectServiceFactory>[0]);
  return { service, sendMail };
};

describe("projectService.requestProjectAccess", () => {
  test("should email the members whose custom role can add members when the project has no admin", async () => {
    // Setup
    const { service, sendMail } = setup();

    // Action
    await service.requestProjectAccess({ actor, projectId: "project-1", comment: "" });

    // Assert
    expect(sendMail).toHaveBeenCalledWith(expect.objectContaining({ recipients: ["inviter@example.com"] }));
  });
});
