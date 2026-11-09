import { ForbiddenError, subject } from "@casl/ability";

import { ActionProjectType, OrganizationActionScope, ProjectType } from "@app/db/schemas";
import { OrgPermissionAppConnectionActions, OrgPermissionSubjects } from "@app/ee/services/permission/org-permission";
import { TPermissionServiceFactory } from "@app/ee/services/permission/permission-service-types";
import {
  ProjectPermissionAppConnectionActions,
  ProjectPermissionSub
} from "@app/ee/services/permission/project-permission";
import { BadRequestError, NotFoundError } from "@app/lib/errors";
import { OrgServiceActor } from "@app/lib/types";
import { TKmsServiceFactory } from "@app/services/kms/kms-service";
import { TProjectDALFactory } from "@app/services/project/project-dal";

import { TAppConnectionDALFactory } from "../app-connection-dal";
import { AppConnection } from "../app-connection-enums";
import { decryptAppConnectionConfiguration } from "../app-connection-fns";
import {
  awsProvisioningTemplateProvider,
  TAwsProvisioningTemplateQuery,
  TAwsProvisioningUpdateQuery
} from "./aws/aws-provisioning-template-fns";
import { TProvisioningTemplate, TProvisioningTemplateProvider } from "./provisioning-template-types";

type TProvisioningTemplateQueries = {
  [AppConnection.AWS]: TAwsProvisioningTemplateQuery;
};

type TProvisioningUpdateQueries = {
  [AppConnection.AWS]: TAwsProvisioningUpdateQuery;
};

const PROVISIONING_TEMPLATE_PROVIDERS: {
  [App in keyof TProvisioningTemplateQueries]: TProvisioningTemplateProvider<
    TProvisioningTemplateQueries[App],
    TProvisioningUpdateQueries[App]
  >;
} = {
  [AppConnection.AWS]: awsProvisioningTemplateProvider
};

type TProvisioningTemplateServiceFactoryDep = {
  permissionService: Pick<TPermissionServiceFactory, "getOrgPermission" | "getProjectPermission">;
  projectDAL: Pick<TProjectDALFactory, "findProjectById">;
  appConnectionDAL: Pick<TAppConnectionDALFactory, "findById">;
  kmsService: Pick<TKmsServiceFactory, "createCipherPairWithDataKey">;
};

export type TProvisioningTemplateServiceFactory = ReturnType<typeof provisioningTemplateServiceFactory>;

export const provisioningTemplateServiceFactory = ({
  permissionService,
  projectDAL,
  appConnectionDAL,
  kmsService
}: TProvisioningTemplateServiceFactoryDep) => {
  const getProvisioningTemplate = async <App extends keyof TProvisioningTemplateQueries>(
    app: App,
    { projectId, query }: { projectId?: string; query: TProvisioningTemplateQueries[App] },
    actor: OrgServiceActor
  ): Promise<TProvisioningTemplate | null> => {
    let externalId = actor.orgId;

    if (projectId) {
      const project = await projectDAL.findProjectById(projectId);
      if (!project) throw new BadRequestError({ message: `Could not find project with ID ${projectId}` });

      const { permission } = await permissionService.getProjectPermission({
        actor: actor.type,
        actorId: actor.id,
        projectId,
        actorAuthMethod: actor.authMethod,
        actorOrgId: actor.orgId,
        actionProjectType: ActionProjectType.Any
      });

      ForbiddenError.from(permission).throwUnlessCan(
        ProjectPermissionAppConnectionActions.Create,
        ProjectPermissionSub.AppConnections
      );

      // Certificate Manager projects (and legacy connections, plus org scope) use the org ID as External ID;
      // every other project type uses the project ID, matching how the connection assumes the role.
      if (project.type !== ProjectType.CertificateManager) externalId = projectId;
    } else {
      const { permission } = await permissionService.getOrgPermission({
        actorId: actor.id,
        actor: actor.type,
        orgId: actor.orgId,
        actorOrgId: actor.orgId,
        actorAuthMethod: actor.authMethod,
        scope: OrganizationActionScope.Any
      });

      ForbiddenError.from(permission).throwUnlessCan(
        OrgPermissionAppConnectionActions.Create,
        OrgPermissionSubjects.AppConnections
      );
    }

    return PROVISIONING_TEMPLATE_PROVIDERS[app].getTemplate({ externalId }, query);
  };

  const getConnectionProvisioningTemplate = async <App extends keyof TProvisioningTemplateQueries>(
    app: App,
    { connectionId, query }: { connectionId: string; query: TProvisioningUpdateQueries[App] },
    actor: OrgServiceActor
  ): Promise<TProvisioningTemplate | null> => {
    const appConnection = await appConnectionDAL.findById(connectionId);

    if (!appConnection || appConnection.orgId !== actor.orgId)
      throw new NotFoundError({ message: `Could not find App Connection with ID ${connectionId}` });

    if (appConnection.projectId) {
      const { permission } = await permissionService.getProjectPermission({
        actor: actor.type,
        actorId: actor.id,
        projectId: appConnection.projectId,
        actorAuthMethod: actor.authMethod,
        actorOrgId: actor.orgId,
        actionProjectType: ActionProjectType.Any
      });

      ForbiddenError.from(permission).throwUnlessCan(
        ProjectPermissionAppConnectionActions.Edit,
        subject(ProjectPermissionSub.AppConnections, { connectionId })
      );
    } else {
      const { permission } = await permissionService.getOrgPermission({
        actorId: actor.id,
        actor: actor.type,
        orgId: appConnection.orgId,
        actorOrgId: actor.orgId,
        actorAuthMethod: actor.authMethod,
        scope: OrganizationActionScope.Any
      });

      ForbiddenError.from(permission).throwUnlessCan(
        OrgPermissionAppConnectionActions.Edit,
        subject(OrgPermissionSubjects.AppConnections, { connectionId })
      );
    }

    if (appConnection.app !== app)
      throw new BadRequestError({ message: `App Connection with ID ${connectionId} is not for App "${app}"` });

    const configuration = await decryptAppConnectionConfiguration({
      orgId: appConnection.orgId,
      projectId: appConnection.projectId,
      encryptedConfiguration: appConnection.encryptedConfiguration,
      kmsService
    });

    return PROVISIONING_TEMPLATE_PROVIDERS[app].getUpdateTemplate(
      { configuration, method: appConnection.method },
      query
    );
  };

  return { getProvisioningTemplate, getConnectionProvisioningTemplate };
};
