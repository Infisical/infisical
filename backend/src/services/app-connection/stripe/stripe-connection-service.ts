import { OrgServiceActor } from "@app/lib/types";

import { AppConnection } from "../app-connection-enums";
import { listStripeApiKeys, throwStripeApiKeyManagementError } from "./stripe-connection-public-client";
import { TStripeConnection } from "./stripe-connection-types";

type TGetAppConnectionFunc = (
  app: AppConnection,
  connectionId: string,
  actor: OrgServiceActor
) => Promise<TStripeConnection>;

export type TStripeApiKeySummary = {
  id: string;
  name: string;
  status: string;
  permissions: string[];
  connectPermissions: string[];
};

export const stripeConnectionService = (getAppConnection: TGetAppConnectionFunc) => {
  const listApiKeys = async (connectionId: string, actor: OrgServiceActor): Promise<TStripeApiKeySummary[]> => {
    const appConnection = await getAppConnection(AppConnection.Stripe, connectionId, actor);
    const { accountId } = appConnection.credentials;

    try {
      const keys = await listStripeApiKeys(accountId);

      // Stripe returns secret_key.token, in full plaintext, for every key in the account. Mapping to
      // an explicit shape here is what keeps it out of the HTTP response.
      return keys.map((key) => ({
        id: key.id,
        name: key.name ?? "",
        status: key.status ?? "",
        permissions: key.permissions ?? [],
        connectPermissions: key.connect_permissions ?? []
      }));
    } catch (error) {
      return throwStripeApiKeyManagementError(accountId, error);
    }
  };

  return { listApiKeys };
};
