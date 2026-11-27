import { randomUUID } from "node:crypto";

import { AccessScope, ProjectMembershipRole, ProjectType } from "@app/db/schemas";
import type { TActorContext } from "@app/domains/lib/actor-context";
import { buildAccessControl } from "@app/domains/platform/access-control/ce/testing/build-access-control";
import { FakeProjectPermissionService } from "@app/domains/platform/projects/ce/testing/fake-project-permission-service";
import { FakeProjectsService } from "@app/domains/platform/projects/ce/testing/fake-projects-service";
import { FakeChatDeliveryService } from "@app/domains/platform/workflow-integrations/ce/testing/fake-chat-delivery-service";
import { FakeWorkflowIntegrationService } from "@app/domains/platform/workflow-integrations/ce/testing/fake-workflow-integration-service";
import { ActorType, AuthMethod } from "@app/lib/auth/actor-types";
import type { TUserPrincipal } from "@app/lib/auth/principal";

import { SecretsChatNotificationService } from "../services/chat-notification/service";
import { ProjectChatConfigService } from "../services/project-chat-config/service";
import { InMemorySecretsStores } from "./in-memory-secrets-stores";

export const SITE_URL = "https://app.infisical.test";

// The chat services over in-memory stores, with real project permissions (so roles decide) and the Workflow
// Integrations fakes. One org with one Secret Manager project; `addProject` makes more.
export const buildProjectChatConfig = () => {
  const accessControl = buildAccessControl();
  const memory = new InMemorySecretsStores();
  const projectsService = new FakeProjectsService();
  const workflowIntegrationService = new FakeWorkflowIntegrationService();
  const chatDeliveryService = new FakeChatDeliveryService();
  const projectPermissionService = new FakeProjectPermissionService(projectsService, accessControl.actorGrantsService);

  const projectChatConfigService = new ProjectChatConfigService(
    memory.transactionRunner,
    memory.slackProjectChatConfigStore,
    memory.microsoftTeamsProjectChatConfigStore,
    projectPermissionService,
    projectsService,
    workflowIntegrationService
  );
  const secretsChatNotificationService = new SecretsChatNotificationService(
    memory.slackProjectChatConfigStore,
    memory.microsoftTeamsProjectChatConfigStore,
    projectsService,
    chatDeliveryService,
    SITE_URL
  );

  const orgId = randomUUID();
  const addProject = (inOrgId = orgId) => {
    const id = randomUUID();
    projectsService.rows.set(id, {
      id,
      name: `project-${id}`,
      slug: `project-${id}`,
      orgId: inOrgId,
      type: ProjectType.SecretManager,
      enforceEncryptedSecretManagerSecretMetadata: false
    });
    return id;
  };
  const projectId = addProject();

  const actorIn = (principal: TUserPrincipal, inOrgId = orgId): TActorContext => ({
    principal,
    org: {
      id: inOrgId,
      name: "org",
      rootOrgId: inOrgId,
      parentOrgId: inOrgId,
      shouldUseNewPrivilegeSystem: true,
      ssoPolicy: { authEnforced: false, googleSsoAuthEnforced: false, bypassOrgAuthEnabled: false }
    }
  });

  // A project member with the given role, and the actor context to act as them.
  const member = async (role: string = ProjectMembershipRole.Admin, inProjectId = projectId) => {
    const principal: TUserPrincipal = {
      type: ActorType.USER,
      id: randomUUID(),
      username: `user-${randomUUID()}`,
      email: null,
      authMethod: AuthMethod.EMAIL,
      isSuperAdmin: false
    };
    await accessControl.seed.membership({
      scope: AccessScope.Project,
      orgId,
      projectId: inProjectId,
      actor: { userId: principal.id },
      roles: [{ role }]
    });
    return actorIn(principal);
  };

  return {
    memory,
    projectChatConfigService,
    secretsChatNotificationService,
    workflowIntegrationService,
    chatDeliveryService,
    projectsService,
    orgId,
    projectId,
    addProject,
    member
  };
};
