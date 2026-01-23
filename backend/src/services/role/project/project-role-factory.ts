import { ForbiddenError } from "@casl/ability";
import { v4 as uuidv4 } from "uuid";

import { AccessScope, ActionProjectType, ProjectMembershipRole, ProjectType } from "@app/db/schemas/models";
import {
  cryptographicOperatorPermissions,
  projectAdminPermissions,
  projectMemberPermissions,
  projectNoAccessPermissions,
  projectViewerPermission,
  sshHostBootstrapPermissions
} from "@app/ee/services/permission/default-roles";
import { TPermissionServiceFactory } from "@app/ee/services/permission/permission-service-types";
import {
  isCustomProjectRole,
  ProjectPermissionActions,
  ProjectPermissionSub
} from "@app/ee/services/permission/project-permission";
import { BadRequestError } from "@app/lib/errors";
import { TProjectDALFactory } from "@app/services/project/project-dal";

import { TRoleScopeFactory } from "../role-types";

type TProjectRoleScopeFactoryDep = {
  permissionService: Pick<TPermissionServiceFactory, "getProjectPermission">;
  projectDAL: Pick<TProjectDALFactory, "findById">;
};

export const newProjectRoleFactory = ({
  permissionService,
  projectDAL
}: TProjectRoleScopeFactoryDep): TRoleScopeFactory => {
  const getScopeField: TRoleScopeFactory["getScopeField"] = (dto) => {
    if (dto.scope === AccessScope.Project) {
      return { key: "projectId" as const, value: dto.projectId };
    }
    throw new BadRequestError({ message: "Invalid scope provided for the factory" });
  };

  const isCustomRole: TRoleScopeFactory["isCustomRole"] = (role: string) => isCustomProjectRole(role);

  const onCreateRoleGuard: TRoleScopeFactory["onCreateRoleGuard"] = async (dto) => {
    const scope = getScopeField(dto.scopeData);
    const { permission } = await permissionService.getProjectPermission({
      actor: dto.permission.type,
      actorId: dto.permission.id,
      actionProjectType: ActionProjectType.Any,
      actorAuthMethod: dto.permission.authMethod,
      projectId: scope.value,
      actorOrgId: dto.permission.orgId
    });
    ForbiddenError.from(permission).throwUnlessCan(ProjectPermissionActions.Create, ProjectPermissionSub.Role);
  };

  const onUpdateRoleGuard: TRoleScopeFactory["onUpdateRoleGuard"] = async (dto) => {
    const scope = getScopeField(dto.scopeData);
    const { permission } = await permissionService.getProjectPermission({
      actor: dto.permission.type,
      actorId: dto.permission.id,
      actionProjectType: ActionProjectType.Any,
      actorAuthMethod: dto.permission.authMethod,
      projectId: scope.value,
      actorOrgId: dto.permission.orgId
    });
    ForbiddenError.from(permission).throwUnlessCan(ProjectPermissionActions.Edit, ProjectPermissionSub.Role);
  };

  const onDeleteRoleGuard: TRoleScopeFactory["onDeleteRoleGuard"] = async (dto) => {
    const scope = getScopeField(dto.scopeData);
    const { permission } = await permissionService.getProjectPermission({
      actor: dto.permission.type,
      actorId: dto.permission.id,
      actionProjectType: ActionProjectType.Any,
      actorAuthMethod: dto.permission.authMethod,
      projectId: scope.value,
      actorOrgId: dto.permission.orgId
    });
    ForbiddenError.from(permission).throwUnlessCan(ProjectPermissionActions.Delete, ProjectPermissionSub.Role);
  };

  const onListRoleGuard: TRoleScopeFactory["onListRoleGuard"] = async (dto) => {
    const scope = getScopeField(dto.scopeData);
    const { permission } = await permissionService.getProjectPermission({
      actor: dto.permission.type,
      actorId: dto.permission.id,
      actionProjectType: ActionProjectType.Any,
      actorAuthMethod: dto.permission.authMethod,
      projectId: scope.value,
      actorOrgId: dto.permission.orgId
    });
    ForbiddenError.from(permission).throwUnlessCan(ProjectPermissionActions.Read, ProjectPermissionSub.Role);
  };

  const onGetRoleByIdGuard: TRoleScopeFactory["onGetRoleByIdGuard"] = async (dto) => {
    const scope = getScopeField(dto.scopeData);
    const { permission } = await permissionService.getProjectPermission({
      actor: dto.permission.type,
      actorId: dto.permission.id,
      actionProjectType: ActionProjectType.Any,
      actorAuthMethod: dto.permission.authMethod,
      projectId: scope.value,
      actorOrgId: dto.permission.orgId
    });
    ForbiddenError.from(permission).throwUnlessCan(ProjectPermissionActions.Read, ProjectPermissionSub.Role);
  };

  const onGetRoleBySlugGuard: TRoleScopeFactory["onGetRoleBySlugGuard"] = async (dto) => {
    const scope = getScopeField(dto.scopeData);
    const { permission } = await permissionService.getProjectPermission({
      actor: dto.permission.type,
      actorId: dto.permission.id,
      actionProjectType: ActionProjectType.Any,
      actorAuthMethod: dto.permission.authMethod,
      projectId: scope.value,
      actorOrgId: dto.permission.orgId
    });
    ForbiddenError.from(permission).throwUnlessCan(ProjectPermissionActions.Read, ProjectPermissionSub.Role);
  };

  const getPredefinedRoles: TRoleScopeFactory["getPredefinedRoles"] = async (scopeData) => {
    const scope = getScopeField(scopeData);
    const project = await projectDAL.findById(scope.value);
    if (!project) throw new BadRequestError({ message: "Project not found" });
    const projectId = project.id;

    return [
      {
        id: uuidv4(),
        name: "Admin",
        slug: ProjectMembershipRole.Admin,
        permissions: projectAdminPermissions,
        description: "Full administrative access over a project",
        createdAt: new Date(),
        updatedAt: new Date(),
        projectId
      },
      {
        id: uuidv4(),
        name: "Developer",
        slug: ProjectMembershipRole.Member,
        permissions: projectMemberPermissions,
        description: "Limited read/write role in a project",
        createdAt: new Date(),
        updatedAt: new Date(),
        projectId
      },
      {
        id: uuidv4(),
        name: "SSH Host Bootstrapper",
        slug: ProjectMembershipRole.SshHostBootstrapper,
        permissions: sshHostBootstrapPermissions,
        description: "Create and issue SSH Hosts in a project",
        createdAt: new Date(),
        updatedAt: new Date(),
        projectId,
        type: ProjectType.SSH
      },
      {
        id: uuidv4(),
        name: "Cryptographic Operator",
        slug: ProjectMembershipRole.KmsCryptographicOperator,
        permissions: cryptographicOperatorPermissions,
        description: "Perform cryptographic operations, such as encryption and signing, in a project",
        createdAt: new Date(),
        updatedAt: new Date(),
        projectId,
        type: ProjectType.KMS
      },
      {
        id: uuidv4(),
        name: "Viewer",
        slug: ProjectMembershipRole.Viewer,
        permissions: projectViewerPermission,
        description: "Only read role in a project",
        createdAt: new Date(),
        projectId,
        updatedAt: new Date()
      },
      {
        id: uuidv4(),
        name: "No Access",
        slug: ProjectMembershipRole.NoAccess,
        permissions: projectNoAccessPermissions,
        description: "No access to any resources in the project",
        createdAt: new Date(),
        projectId,
        updatedAt: new Date()
      }
    ].filter(({ type }) => (type ? type === project.type : true));
  };

  return {
    onCreateRoleGuard,
    onUpdateRoleGuard,
    onDeleteRoleGuard,
    onListRoleGuard,
    onGetRoleByIdGuard,
    onGetRoleBySlugGuard,
    getScopeField,
    getPredefinedRoles,
    isCustomRole
  };
};
