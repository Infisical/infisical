import { Knex } from "knex";

import { TGatewayServiceFactory } from "@app/ee/services/gateway/gateway-service";
import { TGatewayPoolServiceFactory } from "@app/ee/services/gateway-pool/gateway-pool-service";
import { TGatewayV2ServiceFactory } from "@app/ee/services/gateway-v2/gateway-v2-service";
import { executeWithPotentialGateway } from "@app/services/app-connection/shared/sql";
import { TSqlConnectionConfig } from "@app/services/app-connection/shared/sql/sql-connection-types";

import { PAM_ROTATION_APP_MAP, TSqlRotatableType } from "../pam-rotation-fns";

// Must stay well under the per-account rotation lock TTL so a hung query can't let the lock expire mid-rotation.
export const SQL_QUERY_TIMEOUT = 30 * 1000;

export type TPamSqlConnectionDetails = {
  host: string;
  port: number;
  database: string;
  sslEnabled?: boolean;
  sslRejectUnauthorized?: boolean;
  sslCertificate?: string;
};

export type TPamRotationGatewayDeps = {
  gatewayService: Pick<TGatewayServiceFactory, "fnGetGatewayClientTlsByGatewayId">;
  gatewayV2Service: Pick<TGatewayV2ServiceFactory, "getPlatformConnectionDetailsByGatewayId">;
  gatewayPoolService: Pick<TGatewayPoolServiceFactory, "resolveEffectiveGatewayId">;
};

// Delegates to executeWithPotentialGateway so rotation reuses the one gateway/SSRF path every other SQL path uses.
export const withPamSqlClient = async <T>(
  input: {
    accountType: TSqlRotatableType;
    connectionDetails: TPamSqlConnectionDetails;
    auth: { username: string; password: string };
    gatewayId?: string | null;
    gatewayPoolId?: string | null;
  },
  { gatewayService, gatewayV2Service, gatewayPoolService }: TPamRotationGatewayDeps,
  operation: (client: Knex) => Promise<T>
): Promise<T> => {
  const { accountType, connectionDetails, auth, gatewayId, gatewayPoolId } = input;

  const config = {
    app: PAM_ROTATION_APP_MAP[accountType],
    credentials: {
      host: connectionDetails.host,
      port: connectionDetails.port,
      database: connectionDetails.database,
      username: auth.username,
      password: auth.password,
      sslEnabled: connectionDetails.sslEnabled ?? false,
      sslRejectUnauthorized: connectionDetails.sslRejectUnauthorized ?? true,
      sslCertificate: connectionDetails.sslCertificate
    },
    gatewayId,
    gatewayPoolId
  } as TSqlConnectionConfig;

  return executeWithPotentialGateway(config, gatewayService, gatewayV2Service, operation, gatewayPoolService);
};
