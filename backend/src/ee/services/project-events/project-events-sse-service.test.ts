import { afterEach, describe, expect, test, vi } from "vitest";

import { ProjectType } from "@app/db/schemas";
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
// connection or stream is opened.
const buildService = ({
  projectType,
  projectRules,
  secretsRules = []
}: {
  projectType: ProjectType;
  projectRules: TPermissionRule<ProjectPermissionSet>[];
  secretsRules?: TPermissionRule<ProjectPermissionSet>[];
}) => {
  const projectPermissionService = {
    getProjectAccess: vi.fn(async () => ({
      project: { type: projectType },
      toPermission: () => Permission.fromRules({ rules: projectRules })
    }))
  };
  const secretsPermissionService = {
    getSecretsPermission: vi.fn(async () => ({ permission: Permission.fromRules({ rules: secretsRules }) }))
  };
  const service = projectEventsSSEServiceFactory({
    projectEventsService: { subscribe: vi.fn() },
    projectPermissionService,
    secretsPermissionService,
    actorContextService: {},
    licenseService: { getPlan: vi.fn(async () => ({ has: () => false })) },
    keyStore: {},
    projectEnvDAL: { find: vi.fn(async () => []) }
  } as unknown as Parameters<typeof projectEventsSSEServiceFactory>[0]);
  return { service, projectPermissionService, secretsPermissionService };
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

  test("should check a project that is not Secret Manager against its own project permission", async () => {
    // Setup
    const { service, secretsPermissionService } = buildService({
      projectType: ProjectType.PAM,
      projectRules: subscribeToCreation
    });
    close = service.close;

    // Action and assert
    await expect(subscribe(service)).rejects.toThrow(BadRequestError);
    expect(secretsPermissionService.getSecretsPermission).not.toHaveBeenCalled();
  });

  test("should refuse a project that is not Secret Manager when its permission lacks the subscription", async () => {
    // Setup
    const { service } = buildService({ projectType: ProjectType.PAM, projectRules: [] });
    close = service.close;

    // Action and assert
    await expect(subscribe(service)).rejects.toThrow(PermissionDeniedError);
  });

  test("should check a Secret Manager project through Secrets, so folder grants apply", async () => {
    // Setup
    const { service, secretsPermissionService } = buildService({
      projectType: ProjectType.SecretManager,
      projectRules: [],
      secretsRules: subscribeToCreation
    });
    close = service.close;

    // Action and assert
    await expect(subscribe(service)).rejects.toThrow(BadRequestError);
    expect(secretsPermissionService.getSecretsPermission).toHaveBeenCalledWith({ actor, projectId: PROJECT_ID });
  });
});
