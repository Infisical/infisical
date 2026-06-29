import https from "node:https";

import { customAlphabet } from "nanoid";
import { z } from "zod";

import { TDynamicSecrets } from "@app/db/schemas";
import { request } from "@app/lib/config/request";
import { BadRequestError } from "@app/lib/errors";
import { sanitizeString } from "@app/lib/fn";
import { GatewayProxyProtocol, withGatewayProxy } from "@app/lib/gateway";
import { withGatewayV2Proxy } from "@app/lib/gateway-v2/gateway-v2";
import { logger } from "@app/lib/logger";
import { blockLocalAndPrivateIpAddresses } from "@app/lib/validator/validate-url";
import { generatePasswordWithConstraints } from "@app/services/secret-validation-rule/secret-validation-rule-password-generator";

import { ActorIdentityAttributes } from "../../dynamic-secret-lease/dynamic-secret-lease-types";
import { TGatewayServiceFactory } from "../../gateway/gateway-service";
import { TGatewayPoolServiceFactory } from "../../gateway-pool/gateway-pool-service";
import { TGatewayV2ServiceFactory } from "../../gateway-v2/gateway-v2-service";
import { verifyHostInputValidity } from "../dynamic-secret-fns";
import {
  DynamicSecretMilvusSchema,
  TDynamicProviderCreateMetadata,
  TDynamicProviderFns,
  TMilvusLeaseData
} from "./models";
import { generateUsername } from "./templateUtils";

type TMilvusProviderInputs = z.infer<typeof DynamicSecretMilvusSchema>;

type TMilvusProviderDTO = {
  gatewayService: Pick<TGatewayServiceFactory, "fnGetGatewayClientTlsByGatewayId">;
  gatewayV2Service: Pick<TGatewayV2ServiceFactory, "getPlatformConnectionDetailsByGatewayId">;
  gatewayPoolService: Pick<TGatewayPoolServiceFactory, "resolveEffectiveGatewayId">;
};

type MilvusRolePrivilege = {
  dbName: string;
  grantor: string;
  objectName: string;
  objectType: string;
  privilege: string;
};

type MilvusDescribeRoleResponse = {
  code: number;
  data: MilvusRolePrivilege[];
};

const generatePassword = () => {
  const charset = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789-_!@*";
  return customAlphabet(charset, 32)();
};

export const parseMilvusHost = (providerInputs: TMilvusProviderInputs, host: string, port: number) => {
  const hostWithoutScheme = host.replace(/^https?:\/\//i, "");

  let scheme: "http" | "https";
  if (/^https:\/\//i.test(providerInputs.host)) {
    scheme = "https";
  } else if (/^http:\/\//i.test(providerInputs.host)) {
    scheme = "http";
  } else {
    scheme = providerInputs.ca ? "https" : "http";
  }

  let url: URL;
  try {
    url = new URL(`${scheme}://${hostWithoutScheme}`);
  } catch (err) {
    logger.error(err, `Invalid Milvus host URL: ${host}`);
    throw new BadRequestError({ message: "Invalid Milvus host URL" });
  }

  url.port = String(port);
  return { hostname: url.hostname, origin: url.origin };
};

const buildBaseUrl = (providerInputs: TMilvusProviderInputs, host: string, port: number) => {
  const { origin } = parseMilvusHost(providerInputs, host, port);
  return origin;
};

export const MILVUS_MAX_USERNAME_LENGTH = 32;
export const MILVUS_ROLE_PREFIX = "role_";
export const MILVUS_USER_PREFIX = "user_";

export const sanitizeMilvusUsername = (username: string) => username.substring(0, MILVUS_MAX_USERNAME_LENGTH);

export const deriveRoleName = (username: string) =>
  `${MILVUS_ROLE_PREFIX}${username}`.substring(0, MILVUS_MAX_USERNAME_LENGTH);

export const MilvusProvider = ({
  gatewayService,
  gatewayV2Service,
  gatewayPoolService
}: TMilvusProviderDTO): TDynamicProviderFns<TMilvusLeaseData> => {
  const validateProviderInputs = async (inputs: object) => {
    const providerInputs = await DynamicSecretMilvusSchema.parseAsync(inputs);
    const { hostname, origin } = parseMilvusHost(providerInputs, providerInputs.host, providerInputs.port);
    const isGateway = Boolean(providerInputs.gatewayId || providerInputs.gatewayPoolId);

    await blockLocalAndPrivateIpAddresses(origin, isGateway);

    await verifyHostInputValidity({ host: hostname, isDynamicSecret: true, isGateway });
    return providerInputs;
  };

  const $requestConfig = (providerInputs: TMilvusProviderInputs, host: string, port: number) => ({
    baseURL: buildBaseUrl(providerInputs, host, port),
    headers: {
      Authorization: `Bearer ${providerInputs.username}:${providerInputs.password}`,
      "Content-Type": "application/json"
    },
    timeout: 30000,
    maxRedirects: 0,
    httpsAgent: new https.Agent({
      ca: providerInputs.ca || undefined,
      rejectUnauthorized: providerInputs.sslRejectUnauthorized
    })
  });

  const $buildClientHttpsAgent = (providerInputs: TMilvusProviderInputs) =>
    providerInputs.ca
      ? new https.Agent({
          ca: providerInputs.ca,
          rejectUnauthorized: providerInputs.sslRejectUnauthorized
        })
      : undefined;

  const $gatewayProxyWrapper = async <T>(
    inputs: {
      gatewayId: string;
      targetHost: string;
      targetPort: number;
      httpsAgent?: https.Agent;
    },
    gatewayCallback: (host: string, port: number) => Promise<T>
  ): Promise<T> => {
    const bareHostname = new URL(inputs.targetHost).hostname;

    const gatewayV2ConnectionDetails = await gatewayV2Service.getPlatformConnectionDetailsByGatewayId({
      gatewayId: inputs.gatewayId,
      targetHost: bareHostname,
      targetPort: inputs.targetPort
    });

    if (gatewayV2ConnectionDetails) {
      return withGatewayV2Proxy(async (port) => gatewayCallback("localhost", port), {
        relayHost: gatewayV2ConnectionDetails.relayHost,
        gateway: gatewayV2ConnectionDetails.gateway,
        relay: gatewayV2ConnectionDetails.relay,
        protocol: GatewayProxyProtocol.Tcp,
        httpsAgent: inputs.httpsAgent
      });
    }

    const relayDetails = await gatewayService.fnGetGatewayClientTlsByGatewayId(inputs.gatewayId);
    return withGatewayProxy(async (port) => gatewayCallback("localhost", port), {
      relayDetails,
      protocol: GatewayProxyProtocol.Tcp,
      targetHost: bareHostname,
      targetPort: inputs.targetPort,
      httpsAgent: inputs.httpsAgent
    });
  };

  const $runWithOptionalGateway = async <T>(
    providerInputs: TMilvusProviderInputs,
    gatewayCallback: (host: string, port: number) => Promise<T>
  ): Promise<T> => {
    const effectiveGatewayId = await gatewayPoolService.resolveEffectiveGatewayId(providerInputs);
    if (effectiveGatewayId) {
      return $gatewayProxyWrapper(
        {
          gatewayId: effectiveGatewayId,
          targetHost: providerInputs.host,
          targetPort: providerInputs.port,
          httpsAgent: $buildClientHttpsAgent(providerInputs)
        },
        gatewayCallback
      );
    }
    return gatewayCallback(providerInputs.host, providerInputs.port);
  };

  const describeRole = async (
    providerInputs: TMilvusProviderInputs,
    host: string,
    port: number,
    roleName: string
  ): Promise<MilvusDescribeRoleResponse> => {
    const requestConfig = $requestConfig(providerInputs, host, port);
    try {
      const response = await request.post("/v2/vectordb/roles/describe", { roleName }, requestConfig);
      return response.data as MilvusDescribeRoleResponse;
    } catch (err) {
      const sanitizedErrorMessage = sanitizeString({
        unsanitizedString: (err as Error)?.message,
        tokens: [roleName, providerInputs.username, providerInputs.password, providerInputs.host]
      });
      throw new BadRequestError({ message: `Failed to describe Milvus role: ${sanitizedErrorMessage}` });
    }
  };

  const validateConnection = async (inputs: unknown) => {
    const providerInputs = await validateProviderInputs(inputs as object);

    const gatewayCallback = async (host: string, port: number) => {
      const requestConfig = $requestConfig(providerInputs, host, port);
      try {
        await request.post("/v2/vectordb/users/describe", { userName: providerInputs.username }, requestConfig);
      } catch (err) {
        const sanitizedErrorMessage = sanitizeString({
          unsanitizedString: (err as Error)?.message,
          tokens: [providerInputs.username, providerInputs.password, providerInputs.host]
        });
        throw new BadRequestError({ message: `Failed to connect with Milvus: ${sanitizedErrorMessage}` });
      }
    };

    await $runWithOptionalGateway(providerInputs, gatewayCallback);
    return true;
  };

  const create = async (data: {
    inputs: unknown;
    usernameTemplate?: string | null;
    identity: ActorIdentityAttributes;
    dynamicSecret: TDynamicSecrets;
    metadata?: TDynamicProviderCreateMetadata;
  }) => {
    const { inputs, usernameTemplate, identity, dynamicSecret, metadata } = data;
    const providerInputs = await validateProviderInputs(inputs as object);

    const username = await generateUsername(
      usernameTemplate,
      {
        decryptedDynamicSecretInputs: inputs,
        dynamicSecret,
        identity,
        usernamePrefix: MILVUS_USER_PREFIX
      },
      sanitizeMilvusUsername
    );
    const password = metadata?.passwordValidation?.constraints?.length
      ? generatePasswordWithConstraints(metadata.passwordValidation.constraints)
      : generatePassword();
    const roleName = deriveRoleName(username);

    const gatewayCallback = async (host: string, port: number) => {
      const requestConfig = $requestConfig(providerInputs, host, port);

      let userCreated = false;
      let roleCreated = false;

      try {
        await request.post("/v2/vectordb/users/create", { userName: username, password }, requestConfig);
        userCreated = true;

        if (providerInputs.privileges.length > 0) {
          await request.post("/v2/vectordb/roles/create", { roleName }, requestConfig);
          roleCreated = true;

          await Promise.all(
            providerInputs.privileges.map((privilege) =>
              request.post(
                "/v2/vectordb/roles/grant_privilege",
                {
                  roleName,
                  objectType: privilege.objectType,
                  objectName: privilege.objectName,
                  privilege: privilege.privilege,
                  dbName: privilege.dbName ?? providerInputs.database
                },
                requestConfig
              )
            )
          );

          await request.post("/v2/vectordb/users/grant_role", { userName: username, roleName }, requestConfig);
        }

        return {
          entityId: username,
          data: { DB_USERNAME: username, DB_PASSWORD: password }
        };
      } catch (err) {
        if (roleCreated) {
          try {
            await request.post("/v2/vectordb/roles/drop", { roleName }, requestConfig);
          } catch (cleanupErr) {
            logger.error(cleanupErr, `Failed to cleanup Milvus role [roleName=${roleName}]`);
          }
        }
        if (userCreated) {
          try {
            await request.post("/v2/vectordb/users/drop", { userName: username }, requestConfig);
          } catch (cleanupErr) {
            logger.error(cleanupErr, `Failed to cleanup Milvus user [userName=${username}]`);
          }
        }

        const sanitizedErrorMessage = sanitizeString({
          unsanitizedString: (err as Error)?.message,
          tokens: [username, password, providerInputs.username, providerInputs.password, providerInputs.host]
        });
        throw new BadRequestError({ message: `Failed to create Milvus lease: ${sanitizedErrorMessage}` });
      }
    };

    return $runWithOptionalGateway(providerInputs, gatewayCallback);
  };

  const revoke = async (inputs: unknown, entityId: string) => {
    const providerInputs = await validateProviderInputs(inputs as object);
    const username = entityId;
    const roleName = deriveRoleName(username);

    const gatewayCallback = async (host: string, port: number) => {
      const requestConfig = $requestConfig(providerInputs, host, port);

      try {
        try {
          const role = await describeRole(providerInputs, host, port, roleName);
          if (role.code === 0 && role.data.length > 0) {
            await request.post("/v2/vectordb/roles/drop", { roleName }, requestConfig);
          }
        } catch (cleanupErr) {
          logger.error(cleanupErr, `Failed to cleanup Milvus role [roleName=${roleName}]`);
        }

        await request.post("/v2/vectordb/users/drop", { userName: username }, requestConfig);
      } catch (err) {
        const sanitizedErrorMessage = sanitizeString({
          unsanitizedString: (err as Error)?.message,
          tokens: [username, providerInputs.username, providerInputs.password, providerInputs.host]
        });
        throw new BadRequestError({ message: `Failed to revoke Milvus lease: ${sanitizedErrorMessage}` });
      }
    };

    await $runWithOptionalGateway(providerInputs, gatewayCallback);
    return { entityId };
  };

  const renew = async (_inputs: unknown, entityId: string) => {
    return { entityId };
  };

  return {
    validateProviderInputs,
    validateConnection,
    create,
    revoke,
    renew
  };
};
