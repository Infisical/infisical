import { ForbiddenError, subject } from "@casl/ability";

import { TLicenseServiceFactory } from "@app/ee/services/license/license-service";
import { OrgPermissionAppConnectionActions, OrgPermissionSubjects } from "@app/ee/services/permission/org-permission";
import { TPermissionServiceFactory } from "@app/ee/services/permission/permission-service";
import { BadRequestError, DatabaseError, NotFoundError } from "@app/lib/errors";
import { DiscriminativePick, OrgServiceActor } from "@app/lib/types";
import { AppConnection } from "@app/services/app-connection/app-connection-enums";
import {
  decryptAppConnection,
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

    ForbiddenError.from(permission).throwUnlessCan(
      OrgPermissionAppConnectionActions.Read,
      OrgPermissionSubjects.AppConnections
    );

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
        .map((appConnection) => decryptAppConnection(appConnection, kmsService))
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

    ForbiddenError.from(permission).throwUnlessCan(
      OrgPermissionAppConnectionActions.Read,
      OrgPermissionSubjects.AppConnections
    );

    if (appConnection.app !== app)
      throw new BadRequestError({ message: `App Connection with ID ${connectionId} is not for App "${app}"` });

    return decryptAppConnection(appConnection, kmsService);
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

    ForbiddenError.from(permission).throwUnlessCan(
      OrgPermissionAppConnectionActions.Read,
      OrgPermissionSubjects.AppConnections
    );

    if (appConnection.app !== app)
      throw new BadRequestError({ message: `App Connection with name ${connectionName} is not for App "${app}"` });

    return decryptAppConnection(appConnection, kmsService);
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

    ForbiddenError.from(permission).throwUnlessCan(
      OrgPermissionAppConnectionActions.Create,
      OrgPermissionSubjects.AppConnections
    );

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

    return appConnection as TAppConnection;
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

    ForbiddenError.from(permission).throwUnlessCan(
      OrgPermissionAppConnectionActions.Edit,
      OrgPermissionSubjects.AppConnections
    );

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

    return decryptAppConnection(updatedAppConnection, kmsService);
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

    ForbiddenError.from(permission).throwUnlessCan(
      OrgPermissionAppConnectionActions.Delete,
      OrgPermissionSubjects.AppConnections
    );

    if (appConnection.app !== app)
      throw new BadRequestError({ message: `App Connection with ID ${connectionId} is not for App "${app}"` });

    // TODO (scott): add option to delete all dependencies

    try {
      const deletedAppConnection = await appConnectionDAL.deleteById(connectionId);

      return await decryptAppConnection(deletedAppConnection, kmsService);
    } catch (err) {
      if (err instanceof DatabaseError && (err.error as { code: string })?.code === "23503") {
        throw new BadRequestError({
          message:
            "Cannot delete App Connection with existing connections. Remove all existing connections and try again."
        });
      }

      throw err;
    }
  };

  const connectAppConnectionById = async (connectionId: string, actor: OrgServiceActor) => {
    const appConnection = await appConnectionDAL.findById(connectionId);

    if (!appConnection) throw new NotFoundError({ message: `Could not find App Connection with ID ${connectionId}` });

    const { permission: orgPermission } = await permissionService.getOrgPermission(
      actor.type,
      actor.id,
      appConnection.orgId,
      actor.authMethod,
      actor.orgId
    );

    ForbiddenError.from(orgPermission).throwUnlessCan(
      OrgPermissionAppConnectionActions.Connect,
      subject(OrgPermissionSubjects.AppConnections, { connectionId: appConnection.id })
    );

    return decryptAppConnection(appConnection, kmsService);
  };

  const listAvailableAppConnectionsForUser = async (app: AppConnection, actor: OrgServiceActor) => {
    await checkAppServicesAvailability(actor.orgId);

    const { permission: orgPermission } = await permissionService.getOrgPermission(
      actor.type,
      actor.id,
      actor.orgId,
      actor.authMethod,
      actor.orgId
    );

    const appConnections = await appConnectionDAL.find({ app, orgId: actor.orgId });

    const availableConnections = appConnections.filter((connection) =>
      orgPermission.can(
        OrgPermissionAppConnectionActions.Connect,
        subject(OrgPermissionSubjects.AppConnections, { connectionId: connection.id })
      )
    );

    return availableConnections as Omit<TAppConnection, "credentials">[];
  };

  return {
    listAppConnectionOptions,
    listAppConnectionsByOrg,
    findAppConnectionById,
    findAppConnectionByName,
    createAppConnection,
    updateAppConnection,
    deleteAppConnection,
    connectAppConnectionById,
    listAvailableAppConnectionsForUser
  };
};
