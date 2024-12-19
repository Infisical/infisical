import { ForbiddenError } from "@casl/ability";

import { TLicenseServiceFactory } from "@app/ee/services/license/license-service";
import { OrgPermissionActions, OrgPermissionSubjects } from "@app/ee/services/permission/org-permission";
import { TPermissionServiceFactory } from "@app/ee/services/permission/permission-service";
import { BadRequestError, NotFoundError } from "@app/lib/errors";
import { DiscriminativePick, OrgServiceActor } from "@app/lib/types";
import { AppConnection } from "@app/services/app-connection/app-connection-enums";
import {
  decryptAppConnectionCredentials,
  encryptAppConnectionCredentials,
  getAppConnectionMethodName,
  listAppConnectionOptions,
  validateAppConnectionCredentials
} from "@app/services/app-connection/app-connection-fns";
import { APP_CONNECTION_NAME_MAP } from "@app/services/app-connection/app-connection-maps";
import {
  TAppConnection,
  TAppConnectionConfig,
  TCreateAppConnectionDTO,
  TUpdateAppConnectionDTO,
  TValidateAppConnectionCredentials
} from "@app/services/app-connection/app-connection-types";
import { ValidateAwsConnectionCredentialsSchema } from "@app/services/app-connection/aws";
import { ValidateGitHubConnectionCredentialsSchema } from "@app/services/app-connection/github";
import { TKmsServiceFactory } from "@app/services/kms/kms-service";

import { TAppConnectionDALFactory } from "./app-connection-dal";

export type TAppConnectionServiceFactoryDep = {
  appConnectionDAL: TAppConnectionDALFactory;
  permissionService: Pick<TPermissionServiceFactory, "getOrgPermission">;
  kmsService: Pick<TKmsServiceFactory, "createCipherPairWithDataKey">;
  licenseService: Pick<TLicenseServiceFactory, "getPlan">; // TODO: remove once launched
};

export type TAppConnectionServiceFactory = ReturnType<typeof appConnectionServiceFactory>;

const VALIDATE_APP_CONNECTION_CREDENTIALS_MAP: Record<AppConnection, TValidateAppConnectionCredentials> = {
  [AppConnection.AWS]: ValidateAwsConnectionCredentialsSchema,
  [AppConnection.GitHub]: ValidateGitHubConnectionCredentialsSchema
};

export const appConnectionServiceFactory = ({
  appConnectionDAL,
  permissionService,
  kmsService,
  licenseService
}: TAppConnectionServiceFactoryDep) => {
  // app connections are disabled for public until launch
  const checkAppServicesAvailability = async (orgId: string) => {
    const subscription = await licenseService.getPlan(orgId);

    if (!subscription.appConnections) throw new BadRequestError({ message: "App Connections are not available yet." });
  };

  const listAppConnectionsByOrg = async (actor: OrgServiceActor, app?: AppConnection) => {
    await checkAppServicesAvailability(actor.orgId);

    const { permission } = await permissionService.getOrgPermission(
      actor.type,
      actor.id,
      actor.orgId,
      actor.authMethod,
      actor.orgId
    );

    ForbiddenError.from(permission).throwUnlessCan(OrgPermissionActions.Read, OrgPermissionSubjects.AppConnections);

    const appConnections = await appConnectionDAL.find(
      app
        ? { orgId: actor.orgId, app }
        : {
            orgId: actor.orgId
          }
    );

    return Promise.all(
      appConnections
        .sort((a, b) => a.name.toLowerCase().localeCompare(b.name.toLowerCase()))
        .map(async ({ encryptedCredentials, ...connection }) => {
          const credentials = await decryptAppConnectionCredentials({
            encryptedCredentials,
            kmsService,
            orgId: connection.orgId
          });

          return {
            ...connection,
            credentials
          } as TAppConnection;
        })
    );
  };

  const findAppConnectionById = async (app: AppConnection, connectionId: string, actor: OrgServiceActor) => {
    await checkAppServicesAvailability(actor.orgId);

    const appConnection = await appConnectionDAL.findById(connectionId);

    if (!appConnection) throw new NotFoundError({ message: `Could not find App Connection with ID ${connectionId}` });

    const { permission } = await permissionService.getOrgPermission(
      actor.type,
      actor.id,
      actor.orgId,
      actor.authMethod,
      appConnection.orgId
    );

    ForbiddenError.from(permission).throwUnlessCan(OrgPermissionActions.Read, OrgPermissionSubjects.AppConnections);

    if (appConnection.app !== app)
      throw new BadRequestError({ message: `App Connection with ID ${connectionId} is not for App "${app}"` });

    return {
      ...appConnection,
      credentials: await decryptAppConnectionCredentials({
        encryptedCredentials: appConnection.encryptedCredentials,
        orgId: appConnection.orgId,
        kmsService
      })
    } as TAppConnection;
  };

  const findAppConnectionByName = async (app: AppConnection, connectionName: string, actor: OrgServiceActor) => {
    await checkAppServicesAvailability(actor.orgId);

    const appConnection = await appConnectionDAL.findOne({ name: connectionName, orgId: actor.orgId });

    if (!appConnection)
      throw new NotFoundError({ message: `Could not find App Connection with name ${connectionName}` });

    const { permission } = await permissionService.getOrgPermission(
      actor.type,
      actor.id,
      actor.orgId,
      actor.authMethod,
      appConnection.orgId
    );

    ForbiddenError.from(permission).throwUnlessCan(OrgPermissionActions.Read, OrgPermissionSubjects.AppConnections);

    if (appConnection.app !== app)
      throw new BadRequestError({ message: `App Connection with name ${connectionName} is not for App "${app}"` });

    return {
      ...appConnection,
      credentials: await decryptAppConnectionCredentials({
        encryptedCredentials: appConnection.encryptedCredentials,
        orgId: appConnection.orgId,
        kmsService
      })
    } as TAppConnection;
  };

  const createAppConnection = async (
    { method, app, credentials, ...params }: TCreateAppConnectionDTO,
    actor: OrgServiceActor
  ) => {
    await checkAppServicesAvailability(actor.orgId);

    const { permission } = await permissionService.getOrgPermission(
      actor.type,
      actor.id,
      actor.orgId,
      actor.authMethod,
      actor.orgId
    );

    ForbiddenError.from(permission).throwUnlessCan(OrgPermissionActions.Create, OrgPermissionSubjects.AppConnections);

    const appConnection = await appConnectionDAL.transaction(async (tx) => {
      const isConflictingName = Boolean(
        await appConnectionDAL.findOne(
          {
            name: params.name,
            orgId: actor.orgId
          },
          tx
        )
      );

      if (isConflictingName)
        throw new BadRequestError({
          message: `An App Connection with the name "${params.name}" already exists`
        });

      const validatedCredentials = await validateAppConnectionCredentials({
        app,
        credentials,
        method,
        orgId: actor.orgId
      } as TAppConnectionConfig);

      const encryptedCredentials = await encryptAppConnectionCredentials({
        credentials: validatedCredentials,
        orgId: actor.orgId,
        kmsService
      });

      const connection = await appConnectionDAL.create(
        {
          orgId: actor.orgId,
          encryptedCredentials,
          method,
          app,
          ...params
        },
        tx
      );

      return {
        ...connection,
        credentials: validatedCredentials
      };
    });

    return appConnection;
  };

  const updateAppConnection = async (
    { connectionId, credentials, ...params }: TUpdateAppConnectionDTO,
    actor: OrgServiceActor
  ) => {
    await checkAppServicesAvailability(actor.orgId);

    const appConnection = await appConnectionDAL.findById(connectionId);

    if (!appConnection) throw new NotFoundError({ message: `Could not find App Connection with ID ${connectionId}` });

    const { permission } = await permissionService.getOrgPermission(
      actor.type,
      actor.id,
      actor.orgId,
      actor.authMethod,
      appConnection.orgId
    );

    ForbiddenError.from(permission).throwUnlessCan(OrgPermissionActions.Edit, OrgPermissionSubjects.AppConnections);

    const updatedAppConnection = await appConnectionDAL.transaction(async (tx) => {
      if (params.name && appConnection.name !== params.name) {
        const isConflictingName = Boolean(
          await appConnectionDAL.findOne(
            {
              name: params.name,
              orgId: appConnection.orgId
            },
            tx
          )
        );

        if (isConflictingName)
          throw new BadRequestError({
            message: `An App Connection with the name "${params.name}" already exists`
          });
      }

      let encryptedCredentials: undefined | Buffer;

      if (credentials) {
        const { app, method } = appConnection as DiscriminativePick<TAppConnectionConfig, "app" | "method">;

        if (
          !VALIDATE_APP_CONNECTION_CREDENTIALS_MAP[app].safeParse({
            method,
            credentials
          }).success
        )
          throw new BadRequestError({
            message: `Invalid credential format for ${
              APP_CONNECTION_NAME_MAP[app]
            } Connection with method ${getAppConnectionMethodName(method)}`
          });

        const validatedCredentials = await validateAppConnectionCredentials({
          app,
          orgId: actor.orgId,
          credentials,
          method
        } as TAppConnectionConfig);

        if (!validatedCredentials)
          throw new BadRequestError({ message: "Unable to validate connection - check credentials" });

        encryptedCredentials = await encryptAppConnectionCredentials({
          credentials: validatedCredentials,
          orgId: actor.orgId,
          kmsService
        });
      }

      const updatedConnection = await appConnectionDAL.updateById(
        connectionId,
        {
          orgId: actor.orgId,
          encryptedCredentials,
          ...params
        },
        tx
      );

      return updatedConnection;
    });

    return {
      ...updatedAppConnection,
      credentials: await decryptAppConnectionCredentials({
        encryptedCredentials: updatedAppConnection.encryptedCredentials,
        orgId: updatedAppConnection.orgId,
        kmsService
      })
    } as TAppConnection;
  };

  const deleteAppConnection = async (app: AppConnection, connectionId: string, actor: OrgServiceActor) => {
    await checkAppServicesAvailability(actor.orgId);

    const appConnection = await appConnectionDAL.findById(connectionId);

    if (!appConnection) throw new NotFoundError({ message: `Could not find App Connection with ID ${connectionId}` });

    const { permission } = await permissionService.getOrgPermission(
      actor.type,
      actor.id,
      actor.orgId,
      actor.authMethod,
      appConnection.orgId
    );

    ForbiddenError.from(permission).throwUnlessCan(OrgPermissionActions.Delete, OrgPermissionSubjects.AppConnections);

    if (appConnection.app !== app)
      throw new BadRequestError({ message: `App Connection with ID ${connectionId} is not for App "${app}"` });

    // TODO: specify delete error message if due to existing dependencies

    const deletedAppConnection = await appConnectionDAL.deleteById(connectionId);

    return {
      ...deletedAppConnection,
      credentials: await decryptAppConnectionCredentials({
        encryptedCredentials: deletedAppConnection.encryptedCredentials,
        orgId: deletedAppConnection.orgId,
        kmsService
      })
    } as TAppConnection;
  };

  return {
    listAppConnectionOptions,
    listAppConnectionsByOrg,
    findAppConnectionById,
    findAppConnectionByName,
    createAppConnection,
    updateAppConnection,
    deleteAppConnection
  };
};
