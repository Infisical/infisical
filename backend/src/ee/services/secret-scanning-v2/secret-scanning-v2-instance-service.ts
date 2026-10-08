import { OrganizationActionScope, ProjectType } from "@app/db/schemas";
import { TPermissionServiceFactory } from "@app/ee/services/permission/permission-service-types";
import { ActorType } from "@app/services/auth/auth-type";
import { TProjectDALFactory } from "@app/services/project/project-dal";

type TSecretScanningV2InstanceServiceDeps = {
  projectDAL: Pick<TProjectDALFactory, "find">;
  permissionService: Pick<TPermissionServiceFactory, "getOrgPermission">;
};

type TActor = {
  actor: ActorType;
  actorId: string;
  actorAuthMethod: Parameters<TPermissionServiceFactory["getOrgPermission"]>[0]["actorAuthMethod"];
  actorOrgId: string;
};

export type TSecretScanningV2InstanceServiceFactory = ReturnType<typeof secretScanningV2InstanceServiceFactory>;

export const secretScanningV2InstanceServiceFactory = ({
  projectDAL,
  permissionService
}: TSecretScanningV2InstanceServiceDeps) => {
  const getInstanceState = async ({ actor, actorId, actorAuthMethod, actorOrgId }: TActor) => {
    await permissionService.getOrgPermission({
      actor,
      actorId,
      orgId: actorOrgId,
      actorAuthMethod,
      actorOrgId,
      scope: OrganizationActionScope.Any
    });

    // Newest first, matching the resolver: the newest project is the active one.
    const projects = await projectDAL.find(
      { orgId: actorOrgId, type: ProjectType.SecretScanning },
      { sort: [["createdAt", "desc"]] }
    );

    return {
      activeProjectId: projects.length ? projects[0].id : null,
      projects: projects.map((p) => ({
        id: p.id,
        name: p.name,
        slug: p.slug,
        createdAt: p.createdAt
      })),
      isMultiInstance: projects.length > 1
    };
  };

  return {
    getInstanceState
  };
};
