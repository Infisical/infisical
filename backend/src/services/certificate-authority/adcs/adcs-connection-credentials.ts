import { BadRequestError, NotFoundError } from "@app/lib/errors";
import { TAppConnectionDALFactory } from "@app/services/app-connection/app-connection-dal";
import { AppConnection } from "@app/services/app-connection/app-connection-enums";
import { decryptAppConnectionCredentials } from "@app/services/app-connection/app-connection-fns";
import { TKmsServiceFactory } from "@app/services/kms/kms-service";

export type TAdcsResolvedConnection = {
  credentials: { host: string; username: string; password: string };
  gatewayId: string | null;
  gatewayPoolId: string | null;
};

export const getAdcsConnectionCredentials = async (
  appConnectionId: string,
  appConnectionDAL: Pick<TAppConnectionDALFactory, "findById">,
  kmsService: Pick<TKmsServiceFactory, "createCipherPairWithDataKey">
): Promise<TAdcsResolvedConnection> => {
  const appConnection = await appConnectionDAL.findById(appConnectionId);
  if (!appConnection) {
    throw new NotFoundError({ message: `App connection with ID '${appConnectionId}' not found` });
  }

  if (appConnection.app !== AppConnection.ADCS) {
    throw new BadRequestError({ message: `Connection with ID '${appConnectionId}' is not an ADCS connection` });
  }

  if (!appConnection.encryptedCredentials) {
    throw new BadRequestError({ message: "App connection has no stored credentials" });
  }

  const credentials = (await decryptAppConnectionCredentials({
    orgId: appConnection.orgId,
    kmsService,
    encryptedCredentials: appConnection.encryptedCredentials,
    projectId: appConnection.projectId
  })) as { host: string; username: string; password: string };

  return {
    credentials,
    gatewayId: appConnection.gatewayId ?? null,
    gatewayPoolId: appConnection.gatewayPoolId ?? null
  };
};
