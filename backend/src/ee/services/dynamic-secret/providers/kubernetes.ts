import axios from "axios";
import https from "https";

import { InternalServerError } from "@app/lib/errors";
import { withGatewayProxy } from "@app/lib/gateway";
import { blockLocalAndPrivateIpAddresses } from "@app/lib/validator";
import { TKubernetesTokenRequest } from "@app/services/identity-kubernetes-auth/identity-kubernetes-auth-types";

import { TGatewayServiceFactory } from "../../gateway/gateway-service";
import { DynamicSecretKubernetesSchema, TDynamicProviderFns } from "./models";

const EXTERNAL_REQUEST_TIMEOUT = 10 * 1000;

type TKubernetesProviderDTO = {
  gatewayService: Pick<TGatewayServiceFactory, "fnGetGatewayClientTlsByGatewayId">;
};

export const KubernetesProvider = ({ gatewayService }: TKubernetesProviderDTO): TDynamicProviderFns => {
  const validateProviderInputs = async (inputs: unknown) => {
    const providerInputs = await DynamicSecretKubernetesSchema.parseAsync(inputs);
    if (!providerInputs.gatewayId) {
      await blockLocalAndPrivateIpAddresses(providerInputs.url);
    }

    return providerInputs;
  };

  const $gatewayProxyWrapper = async <T>(
    inputs: {
      gatewayId: string;
      targetHost: string;
      targetPort: number;
    },
    gatewayCallback: (host: string, port: number) => Promise<T>
  ): Promise<T> => {
    const relayDetails = await gatewayService.fnGetGatewayClientTlsByGatewayId(inputs.gatewayId);
    const [relayHost, relayPort] = relayDetails.relayAddress.split(":");

    const callbackResult = await withGatewayProxy(
      async (port) => {
        // Needs to be https protocol or the kubernetes API server will fail with "Client sent an HTTP request to an HTTPS server"
        const res = await gatewayCallback("https://localhost", port);
        return res;
      },
      {
        targetHost: inputs.targetHost,
        targetPort: inputs.targetPort,
        relayHost,
        relayPort: Number(relayPort),
        identityId: relayDetails.identityId,
        orgId: relayDetails.orgId,
        tlsOptions: {
          ca: relayDetails.certChain,
          cert: relayDetails.certificate,
          key: relayDetails.privateKey.toString()
        }
      }
    );

    return callbackResult;
  };

  const validateConnection = async (inputs: unknown) => {
    const providerInputs = await validateProviderInputs(inputs);

    const serviceAccountGetCallback = async (host: string, port: number) => {
      const baseUrl = port ? `${host}:${port}` : host;

      await axios.get(
        `${baseUrl}/api/v1/namespaces/${providerInputs.namespace}/serviceaccounts/${providerInputs.serviceAccountName}`,
        {
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${providerInputs.clusterToken}`
          },
          signal: AbortSignal.timeout(EXTERNAL_REQUEST_TIMEOUT),
          timeout: EXTERNAL_REQUEST_TIMEOUT,
          httpsAgent: new https.Agent({
            ca: providerInputs.ca,
            rejectUnauthorized: providerInputs.sslEnabled
          })
        }
      );
    };

    const url = new URL(providerInputs.url);
    const k8sPort = url.port ? Number(url.port) : 443;

    try {
      if (providerInputs.gatewayId) {
        const k8sHost = url.hostname;

        await $gatewayProxyWrapper(
          {
            gatewayId: providerInputs.gatewayId,
            targetHost: k8sHost,
            targetPort: k8sPort
          },
          serviceAccountGetCallback
        );
      } else {
        const k8sHost = `${url.protocol}//${url.hostname}`;
        await serviceAccountGetCallback(k8sHost, k8sPort);
      }

      return true;
    } catch (error) {
      let errorMessage = error instanceof Error ? error.message : "Unknown error";
      if (axios.isAxiosError(error) && (error.response?.data as { message: string })?.message) {
        errorMessage = (error.response?.data as { message: string }).message;
      }

      throw new InternalServerError({
        message: `Failed to validate connection: ${errorMessage}`
      });
    }
  };

  const create = async (inputs: unknown, expireAt: number) => {
    const providerInputs = await validateProviderInputs(inputs);

    const tokenRequestCallback = async (host: string, port: number) => {
      const baseUrl = port ? `${host}:${port}` : host;

      const res = await axios.post<TKubernetesTokenRequest>(
        `${baseUrl}/api/v1/namespaces/${providerInputs.namespace}/serviceaccounts/${providerInputs.serviceAccountName}/token`,
        {
          spec: {
            expirationSeconds: Math.floor((expireAt - Date.now()) / 1000),
            ...(providerInputs.audiences?.length ? { audiences: providerInputs.audiences } : {})
          }
        },
        {
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${providerInputs.clusterToken}`
          },
          signal: AbortSignal.timeout(EXTERNAL_REQUEST_TIMEOUT),
          timeout: EXTERNAL_REQUEST_TIMEOUT,
          httpsAgent: new https.Agent({
            ca: providerInputs.ca,
            rejectUnauthorized: providerInputs.sslEnabled
          })
        }
      );

      return res.data;
    };

    const url = new URL(providerInputs.url);
    const k8sHost = `${url.protocol}//${url.hostname}`;
    const k8sGatewayHost = url.hostname;
    const k8sPort = url.port ? Number(url.port) : 443;

    try {
      const tokenData = providerInputs.gatewayId
        ? await $gatewayProxyWrapper(
            {
              gatewayId: providerInputs.gatewayId,
              targetHost: k8sGatewayHost,
              targetPort: k8sPort
            },
            tokenRequestCallback
          )
        : await tokenRequestCallback(k8sHost, k8sPort);

      return {
        entityId: providerInputs.serviceAccountName,
        data: { TOKEN: tokenData.status.token }
      };
    } catch (error) {
      let errorMessage = error instanceof Error ? error.message : "Unknown error";
      if (axios.isAxiosError(error) && (error.response?.data as { message: string })?.message) {
        errorMessage = (error.response?.data as { message: string }).message;
      }

      throw new InternalServerError({
        message: `Failed to create dynamic secret: ${errorMessage}`
      });
    }
  };

  const revoke = async (_inputs: unknown, entityId: string) => {
    return { entityId };
  };

  const renew = async (_inputs: unknown, entityId: string) => {
    // No renewal necessary
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
