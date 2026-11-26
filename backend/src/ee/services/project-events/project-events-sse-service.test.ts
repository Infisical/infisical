import { afterEach, describe, expect, test, vi } from "vitest";

import { TActorContext } from "@app/domains/lib/actor-context";
import { PermissionDeniedError } from "@app/domains/lib/errors";
import { Permission, TPermissionRule } from "@app/domains/platform/access-control/ce/module";
import {
  ProjectPermissionSecretEventActions,
  ProjectPermissionSet,
  ProjectPermissionSub
} from "@app/domains/platform/projects/ce/module";
import { ActorType } from "@app/lib/auth/actor-types";
import { BadRequestError } from "@app/lib/errors";

import { projectEventsSSEServiceFactory } from "./project-events-sse-service";
import { ProjectEvents } from "./project-events-types";

const PROJECT_ID = "project-1";

const actor = {
  principal: { type: ActorType.USER, id: "user-1" },
  org: { id: "org-1" }
} as unknown as TActorContext;

const subscribeToCreation: TPermissionRule<ProjectPermissionSet>[] = [
  {
    action: [ProjectPermissionSecretEventActions.SubscribeToCreationEvents],
    subject: ProjectPermissionSub.SecretEventSubscriptions
  }
];

// The plan refuses event subscriptions, so a subscribe that passes the permission checks stops there, before any
// stream opens.
const buildService = ({ rules }: { rules: TPermissionRule<ProjectPermissionSet>[] }) => {
  const secretsPermissionService = {
    getProjectPermissionWithFolderGrants: vi.fn(async () => Permission.fromRules({ rules }))
  };
  const service = projectEventsSSEServiceFactory({
    projectEventsService: { subscribe: vi.fn() },
    secretsPermissionService,
    actorContextService: {},
    licenseService: { getPlan: vi.fn(async () => ({ has: () => false })) },
    keyStore: {},
    projectEnvDAL: { find: vi.fn(async () => []) }
  } as unknown as Parameters<typeof projectEventsSSEServiceFactory>[0]);
  return { service, secretsPermissionService };
};

const subscribe = (service: ReturnType<typeof buildService>["service"]) =>
  service.subscribe({
    projectId: PROJECT_ID,
    actor,
    register: [{ event: ProjectEvents.SecretCreate, conditions: { environmentSlug: "dev", secretPath: "/" } }]
  });

describe("projectEventsSSEService.subscribe", () => {
  let close: (() => Promise<void>) | undefined;

  afterEach(async () => {
    await close?.();
    close = undefined;
  });

  test("should check the subscription against the project permission with the actor's folder grants", async () => {
    // Setup
    const { service, secretsPermissionService } = buildService({ rules: subscribeToCreation });
    close = service.close;

    // Action and assert
    await expect(subscribe(service)).rejects.toThrow(BadRequestError);
    expect(secretsPermissionService.getProjectPermissionWithFolderGrants).toHaveBeenCalledWith({
      actor,
      projectId: PROJECT_ID
    });
  });

  test("should refuse a subscription the permission lacks", async () => {
    // Setup
    const { service } = buildService({ rules: [] });
    close = service.close;

    // Action and assert
    await expect(subscribe(service)).rejects.toThrow(PermissionDeniedError);
  });
});
