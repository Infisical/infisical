import axios, { AxiosError } from "axios";
import handlebars from "handlebars";
import https from "https";

import { BadRequestError, InternalServerError } from "@app/lib/errors";
import { GatewayHttpProxyActions, GatewayProxyProtocol, withGatewayProxy } from "@app/lib/gateway";
import { alphaNumericNanoId } from "@app/lib/nanoid";
import { blockLocalAndPrivateIpAddresses } from "@app/lib/validator";
import { TKubernetesTokenRequest } from "@app/services/identity-kubernetes-auth/identity-kubernetes-auth-types";

import { TDynamicSecretKubernetesLeaseConfig } from "../../dynamic-secret-lease/dynamic-secret-lease-types";
import { TGatewayServiceFactory } from "../../gateway/gateway-service";
import {
  DynamicSecretKubernetesSchema,
  KubernetesAuthMethod,
  KubernetesCredentialType,
  KubernetesRoleType,
  TDynamicProviderFns
} from "./models";

const EXTERNAL_REQUEST_TIMEOUT = 10 * 1000;

// This value is just a placeholder. When using gateway auth method, the url is irrelevant.
const GATEWAY_AUTH_DEFAULT_URL = "https://kubernetes.default.svc.cluster.local";

type TKubernetesProviderDTO = {
  gatewayService: Pick<TGatewayServiceFactory, "fnGetGatewayClientTlsByGatewayId">;
};

const generateUsername = (usernameTemplate?: string | null) => {
  const randomUsername = `dynamic-secret-sa-${alphaNumericNanoId(10).toLowerCase()}`;
  if (!usernameTemplate) return randomUsername;

  return handlebars.compile(usernameTemplate)({
    randomUsername,
    unixTimestamp: Math.floor(Date.now() / 100)
  });
};

export const KubernetesProvider = ({ gatewayService }: TKubernetesProviderDTO): TDynamicProviderFns => {
  const validateProviderInputs = async (inputs: unknown) => {
    const providerInputs = await DynamicSecretKubernetesSchema.parseAsync(inputs);
    if (!providerInputs.gatewayId && providerInputs.url) {
      await blockLocalAndPrivateIpAddresses(providerInputs.url);
    }

    return providerInputs;
  };

  const $gatewayProxyWrapper = async <T>(
    inputs: {
      gatewayId: string;
      targetHost: string;
      targetPort: number;
      httpsAgent?: https.Agent;
      reviewTokenThroughGateway: boolean;
    },
    gatewayCallback: (host: string, port: number, httpsAgent?: https.Agent) => Promise<T>
  ): Promise<T> => {
    const relayDetails = await gatewayService.fnGetGatewayClientTlsByGatewayId(inputs.gatewayId);
    const [relayHost, relayPort] = relayDetails.relayAddress.split(":");

    const callbackResult = await withGatewayProxy(
      async (port, httpsAgent) => {
        // Needs to be https protocol or the kubernetes API server will fail with "Client sent an HTTP request to an HTTPS server"
        const res = await gatewayCallback(
          inputs.reviewTokenThroughGateway ? "http://localhost" : "https://localhost",
          port,
          httpsAgent
        );
        return res;
      },
      {
        protocol: inputs.reviewTokenThroughGateway ? GatewayProxyProtocol.Http : GatewayProxyProtocol.Tcp,
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
        },
        // we always pass this, because its needed for both tcp and http protocol
        httpsAgent: inputs.httpsAgent
      }
    );

    return callbackResult;
  };

  const validateConnection = async (inputs: unknown) => {
    const providerInputs = await validateProviderInputs(inputs);

    const serviceAccountDynamicCallback = async (host: string, port: number, httpsAgent?: https.Agent) => {
      if (providerInputs.credentialType !== KubernetesCredentialType.Dynamic) {
        throw new Error("invalid callback");
      }

      const baseUrl = port ? `${host}:${port}` : host;
      const serviceAccountName = generateUsername();
      const roleBindingName = `${serviceAccountName}-role-binding`;

      const namespaces = providerInputs.namespace.split(",").map((namespace) => namespace.trim());

      // Test each namespace sequentially instead of in parallel to simplify cleanup
      for await (const namespace of namespaces) {
        try {
          // 1. Create a test service account
          await axios.post(
            `${baseUrl}/api/v1/namespaces/${namespace}/serviceaccounts`,
            {
              metadata: {
                name: serviceAccountName,
                namespace
              }
            },
            {
              headers: {
                "Content-Type": "application/json",
                ...(providerInputs.authMethod === KubernetesAuthMethod.Gateway
                  ? { "x-infisical-action": GatewayHttpProxyActions.UseGatewayK8sServiceAccount }
                  : { Authorization: `Bearer ${providerInputs.clusterToken}` })
              },
              ...(providerInputs.authMethod === KubernetesAuthMethod.Api
                ? {
                    httpsAgent
                  }
                : {}),
              signal: AbortSignal.timeout(EXTERNAL_REQUEST_TIMEOUT),
              timeout: EXTERNAL_REQUEST_TIMEOUT
            }
          );

          // 2. Create a test role binding
          const roleBindingUrl =
            providerInputs.roleType === KubernetesRoleType.ClusterRole
              ? `${baseUrl}/apis/rbac.authorization.k8s.io/v1/clusterrolebindings`
              : `${baseUrl}/apis/rbac.authorization.k8s.io/v1/namespaces/${namespace}/rolebindings`;

          const roleBindingMetadata = {
            name: roleBindingName,
            ...(providerInputs.roleType !== KubernetesRoleType.ClusterRole && { namespace })
          };

          await axios.post(
            roleBindingUrl,
            {
              metadata: roleBindingMetadata,
              roleRef: {
                kind: providerInputs.roleType === KubernetesRoleType.ClusterRole ? "ClusterRole" : "Role",
                name: providerInputs.role,
                apiGroup: "rbac.authorization.k8s.io"
              },
              subjects: [
                {
                  kind: "ServiceAccount",
                  name: serviceAccountName,
                  namespace
                }
              ]
            },
            {
              headers: {
                "Content-Type": "application/json",
                ...(providerInputs.authMethod === KubernetesAuthMethod.Gateway
                  ? { "x-infisical-action": GatewayHttpProxyActions.UseGatewayK8sServiceAccount }
                  : { Authorization: `Bearer ${providerInputs.clusterToken}` })
              },
              ...(providerInputs.authMethod === KubernetesAuthMethod.Api
                ? {
                    httpsAgent
                  }
                : {}),
              signal: AbortSignal.timeout(EXTERNAL_REQUEST_TIMEOUT),
              timeout: EXTERNAL_REQUEST_TIMEOUT
            }
          );

          // 3. Request a token for the test service account
          await axios.post(
            `${baseUrl}/api/v1/namespaces/${namespace}/serviceaccounts/${serviceAccountName}/token`,
            {
              spec: {
                expirationSeconds: 600, // 10 minutes
                ...(providerInputs.audiences?.length ? { audiences: providerInputs.audiences } : {})
              }
            },
            {
              headers: {
                "Content-Type": "application/json",
                ...(providerInputs.authMethod === KubernetesAuthMethod.Gateway
                  ? { "x-infisical-action": GatewayHttpProxyActions.UseGatewayK8sServiceAccount }
                  : { Authorization: `Bearer ${providerInputs.clusterToken}` })
              },
              ...(providerInputs.authMethod === KubernetesAuthMethod.Api
                ? {
                    httpsAgent
                  }
                : {}),
              signal: AbortSignal.timeout(EXTERNAL_REQUEST_TIMEOUT),
              timeout: EXTERNAL_REQUEST_TIMEOUT
            }
          );

          // 4. Cleanup: delete role binding and service account
          if (providerInputs.roleType === KubernetesRoleType.Role) {
            await axios.delete(
              `${baseUrl}/apis/rbac.authorization.k8s.io/v1/namespaces/${namespace}/rolebindings/${roleBindingName}`,
              {
                headers: {
                  "Content-Type": "application/json",
                  ...(providerInputs.authMethod === KubernetesAuthMethod.Gateway
                    ? { "x-infisical-action": GatewayHttpProxyActions.UseGatewayK8sServiceAccount }
                    : { Authorization: `Bearer ${providerInputs.clusterToken}` })
                },
                ...(providerInputs.authMethod === KubernetesAuthMethod.Api
                  ? {
                      httpsAgent
                    }
                  : {}),
                signal: AbortSignal.timeout(EXTERNAL_REQUEST_TIMEOUT),
                timeout: EXTERNAL_REQUEST_TIMEOUT
              }
            );
          } else {
            await axios.delete(`${baseUrl}/apis/rbac.authorization.k8s.io/v1/clusterrolebindings/${roleBindingName}`, {
              headers: {
                "Content-Type": "application/json",
                ...(providerInputs.authMethod === KubernetesAuthMethod.Gateway
                  ? { "x-infisical-action": GatewayHttpProxyActions.UseGatewayK8sServiceAccount }
                  : { Authorization: `Bearer ${providerInputs.clusterToken}` })
              },
              ...(providerInputs.authMethod === KubernetesAuthMethod.Api
                ? {
                    httpsAgent
                  }
                : {}),
              signal: AbortSignal.timeout(EXTERNAL_REQUEST_TIMEOUT),
              timeout: EXTERNAL_REQUEST_TIMEOUT
            });
          }

          await axios.delete(`${baseUrl}/api/v1/namespaces/${namespace}/serviceaccounts/${serviceAccountName}`, {
            headers: {
              "Content-Type": "application/json",
              ...(providerInputs.authMethod === KubernetesAuthMethod.Gateway
                ? { "x-infisical-action": GatewayHttpProxyActions.UseGatewayK8sServiceAccount }
                : { Authorization: `Bearer ${providerInputs.clusterToken}` })
            },
            ...(providerInputs.authMethod === KubernetesAuthMethod.Api
              ? {
                  httpsAgent
                }
              : {}),
            signal: AbortSignal.timeout(EXTERNAL_REQUEST_TIMEOUT),
            timeout: EXTERNAL_REQUEST_TIMEOUT
          });
        } catch (error) {
          const cleanupInfo = `You may need to manually clean up the following resources in namespace "${namespace}": Service Account - ${serviceAccountName}, ${providerInputs.roleType === KubernetesRoleType.Role ? "Role" : "Cluster Role"} Binding - ${roleBindingName}.`;
          let mainErrorMessage = "Unknown error";
          if (error instanceof AxiosError) {
            mainErrorMessage = (error.response?.data as { message: string })?.message;
          } else if (error instanceof Error) {
            mainErrorMessage = error.message;
          }

          throw new Error(`${mainErrorMessage}. ${cleanupInfo}`);
        }
      }
    };

    const serviceAccountStaticCallback = async (host: string, port: number, httpsAgent?: https.Agent) => {
      if (providerInputs.credentialType !== KubernetesCredentialType.Static) {
        throw new Error("invalid callback");
      }

      const baseUrl = port ? `${host}:${port}` : host;

      await axios.get(
        `${baseUrl}/api/v1/namespaces/${providerInputs.namespace}/serviceaccounts/${providerInputs.serviceAccountName}`,
        {
          headers: {
            "Content-Type": "application/json",
            ...(providerInputs.authMethod === KubernetesAuthMethod.Gateway
              ? { "x-infisical-action": GatewayHttpProxyActions.UseGatewayK8sServiceAccount }
              : { Authorization: `Bearer ${providerInputs.clusterToken}` })
          },
          ...(providerInputs.authMethod === KubernetesAuthMethod.Api
            ? {
                httpsAgent
              }
            : {}),
          signal: AbortSignal.timeout(EXTERNAL_REQUEST_TIMEOUT),
          timeout: EXTERNAL_REQUEST_TIMEOUT
        }
      );
    };

    const rawUrl =
      providerInputs.authMethod === KubernetesAuthMethod.Gateway ? GATEWAY_AUTH_DEFAULT_URL : providerInputs.url || "";
    const url = new URL(rawUrl);
    const k8sGatewayHost = url.hostname;
    const k8sPort = url.port ? Number(url.port) : 443;
    const k8sHost = `${url.protocol}//${url.hostname}`;

    try {
      const httpsAgent =
        providerInputs.ca && providerInputs.sslEnabled
          ? new https.Agent({
              ca: providerInputs.ca,
              rejectUnauthorized: true
            })
          : undefined;

      if (providerInputs.gatewayId) {
        if (providerInputs.authMethod === KubernetesAuthMethod.Gateway) {
          await $gatewayProxyWrapper(
            {
              gatewayId: providerInputs.gatewayId,
              targetHost: k8sHost,
              targetPort: k8sPort,
              httpsAgent,
              reviewTokenThroughGateway: true
            },
            providerInputs.credentialType === KubernetesCredentialType.Static
              ? serviceAccountStaticCallback
              : serviceAccountDynamicCallback
          );
        } else {
          await $gatewayProxyWrapper(
            {
              gatewayId: providerInputs.gatewayId,
              targetHost: k8sGatewayHost,
              targetPort: k8sPort,
              httpsAgent,
              reviewTokenThroughGateway: false
            },
            providerInputs.credentialType === KubernetesCredentialType.Static
              ? serviceAccountStaticCallback
              : serviceAccountDynamicCallback
          );
        }
      } else if (providerInputs.credentialType === KubernetesCredentialType.Static) {
        await serviceAccountStaticCallback(k8sHost, k8sPort, httpsAgent);
      } else {
        await serviceAccountDynamicCallback(k8sHost, k8sPort, httpsAgent);
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

  const create = async ({
    inputs,
    expireAt,
    usernameTemplate,
    config
  }: {
    inputs: unknown;
    expireAt: number;
    usernameTemplate?: string | null;
    config?: TDynamicSecretKubernetesLeaseConfig;
  }) => {
    const providerInputs = await validateProviderInputs(inputs);

    const serviceAccountDynamicCallback = async (host: string, port: number, httpsAgent?: https.Agent) => {
      if (providerInputs.credentialType !== KubernetesCredentialType.Dynamic) {
        throw new Error("invalid callback");
      }

      const baseUrl = port ? `${host}:${port}` : host;
      const serviceAccountName = generateUsername(usernameTemplate);
      const roleBindingName = `${serviceAccountName}-role-binding`;
      const allowedNamespaces = providerInputs.namespace.split(",").map((namespace) => namespace.trim());

      if (config?.namespace && !allowedNamespaces?.includes(config?.namespace)) {
        throw new BadRequestError({
          message: `Namespace ${config?.namespace} is not allowed. Allowed namespaces: ${allowedNamespaces?.join(", ")}`
        });
      }

      const namespace = config?.namespace || allowedNamespaces[0];
      if (!namespace) {
        throw new BadRequestError({
          message: "No namespace provided"
        });
      }

      // 1. Create the service account
      await axios.post(
        `${baseUrl}/api/v1/namespaces/${namespace}/serviceaccounts`,
        {
          metadata: {
            name: serviceAccountName,
            namespace
          }
        },
        {
          headers: {
            "Content-Type": "application/json",
            ...(providerInputs.authMethod === KubernetesAuthMethod.Gateway
              ? { "x-infisical-action": GatewayHttpProxyActions.UseGatewayK8sServiceAccount }
              : { Authorization: `Bearer ${providerInputs.clusterToken}` })
          },
          ...(providerInputs.authMethod === KubernetesAuthMethod.Api
            ? {
                httpsAgent
              }
            : {}),
          signal: AbortSignal.timeout(EXTERNAL_REQUEST_TIMEOUT),
          timeout: EXTERNAL_REQUEST_TIMEOUT
        }
      );

      // 2. Create the role binding
      const roleBindingUrl =
        providerInputs.roleType === KubernetesRoleType.ClusterRole
          ? `${baseUrl}/apis/rbac.authorization.k8s.io/v1/clusterrolebindings`
          : `${baseUrl}/apis/rbac.authorization.k8s.io/v1/namespaces/${namespace}/rolebindings`;

      const roleBindingMetadata = {
        name: roleBindingName,
        ...(providerInputs.roleType !== KubernetesRoleType.ClusterRole && { namespace })
      };

      await axios.post(
        roleBindingUrl,
        {
          metadata: roleBindingMetadata,
          roleRef: {
            kind: providerInputs.roleType === KubernetesRoleType.ClusterRole ? "ClusterRole" : "Role",
            name: providerInputs.role,
            apiGroup: "rbac.authorization.k8s.io"
          },
          subjects: [
            {
              kind: "ServiceAccount",
              name: serviceAccountName,
              namespace
            }
          ]
        },
        {
          headers: {
            "Content-Type": "application/json",
            ...(providerInputs.authMethod === KubernetesAuthMethod.Gateway
              ? { "x-infisical-action": GatewayHttpProxyActions.UseGatewayK8sServiceAccount }
              : { Authorization: `Bearer ${providerInputs.clusterToken}` })
          },
          ...(providerInputs.authMethod === KubernetesAuthMethod.Api
            ? {
                httpsAgent
              }
            : {}),
          signal: AbortSignal.timeout(EXTERNAL_REQUEST_TIMEOUT),
          timeout: EXTERNAL_REQUEST_TIMEOUT
        }
      );

      // 3. Request a token for the service account
      const res = await axios.post<TKubernetesTokenRequest>(
        `${baseUrl}/api/v1/namespaces/${namespace}/serviceaccounts/${serviceAccountName}/token`,
        {
          spec: {
            expirationSeconds: Math.floor((expireAt - Date.now()) / 1000),
            ...(providerInputs.audiences?.length ? { audiences: providerInputs.audiences } : {})
          }
        },
        {
          headers: {
            "Content-Type": "application/json",
            ...(providerInputs.authMethod === KubernetesAuthMethod.Gateway
              ? { "x-infisical-action": GatewayHttpProxyActions.UseGatewayK8sServiceAccount }
              : { Authorization: `Bearer ${providerInputs.clusterToken}` })
          },
          ...(providerInputs.authMethod === KubernetesAuthMethod.Api
            ? {
                httpsAgent
              }
            : {}),
          signal: AbortSignal.timeout(EXTERNAL_REQUEST_TIMEOUT),
          timeout: EXTERNAL_REQUEST_TIMEOUT
        }
      );

      return { ...res.data, serviceAccountName };
    };

    const tokenRequestStaticCallback = async (host: string, port: number, httpsAgent?: https.Agent) => {
      if (providerInputs.credentialType !== KubernetesCredentialType.Static) {
        throw new Error("invalid callback");
      }

      if (config?.namespace && config.namespace !== providerInputs.namespace) {
        throw new BadRequestError({
          message: `Namespace ${config?.namespace} is not allowed. Allowed namespace: ${providerInputs.namespace}.`
        });
      }

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
            ...(providerInputs.authMethod === KubernetesAuthMethod.Gateway
              ? { "x-infisical-action": GatewayHttpProxyActions.UseGatewayK8sServiceAccount }
              : { Authorization: `Bearer ${providerInputs.clusterToken}` })
          },
          ...(providerInputs.authMethod === KubernetesAuthMethod.Api
            ? {
                httpsAgent
              }
            : {}),
          signal: AbortSignal.timeout(EXTERNAL_REQUEST_TIMEOUT),
          timeout: EXTERNAL_REQUEST_TIMEOUT
        }
      );

      return { ...res.data, serviceAccountName: providerInputs.serviceAccountName };
    };

    const rawUrl =
      providerInputs.authMethod === KubernetesAuthMethod.Gateway ? GATEWAY_AUTH_DEFAULT_URL : providerInputs.url || "";
    const url = new URL(rawUrl);
    const k8sHost = `${url.protocol}//${url.hostname}`;
    const k8sGatewayHost = url.hostname;
    const k8sPort = url.port ? Number(url.port) : 443;

    try {
      let tokenData;

      const httpsAgent =
        providerInputs.ca && providerInputs.sslEnabled
          ? new https.Agent({
              ca: providerInputs.ca,
              rejectUnauthorized: true
            })
          : undefined;

      if (providerInputs.gatewayId) {
        if (providerInputs.authMethod === KubernetesAuthMethod.Gateway) {
          tokenData = await $gatewayProxyWrapper(
            {
              gatewayId: providerInputs.gatewayId,
              targetHost: k8sHost,
              targetPort: k8sPort,
              httpsAgent,
              reviewTokenThroughGateway: true
            },
            providerInputs.credentialType === KubernetesCredentialType.Static
              ? tokenRequestStaticCallback
              : serviceAccountDynamicCallback
          );
        } else {
          tokenData = await $gatewayProxyWrapper(
            {
              gatewayId: providerInputs.gatewayId,
              targetHost: k8sGatewayHost,
              targetPort: k8sPort,
              httpsAgent,
              reviewTokenThroughGateway: false
            },
            providerInputs.credentialType === KubernetesCredentialType.Static
              ? tokenRequestStaticCallback
              : serviceAccountDynamicCallback
          );
        }
      } else {
        tokenData =
          providerInputs.credentialType === KubernetesCredentialType.Static
            ? await tokenRequestStaticCallback(k8sHost, k8sPort, httpsAgent)
            : await serviceAccountDynamicCallback(k8sHost, k8sPort, httpsAgent);
      }

      return {
        entityId: tokenData.serviceAccountName,
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

  const revoke = async (
    inputs: unknown,
    entityId: string,
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    _metadata: { projectId: string },
    config?: TDynamicSecretKubernetesLeaseConfig
  ) => {
    const providerInputs = await validateProviderInputs(inputs);

    const serviceAccountDynamicCallback = async (host: string, port: number, httpsAgent?: https.Agent) => {
      if (providerInputs.credentialType !== KubernetesCredentialType.Dynamic) {
        throw new Error("invalid callback");
      }

      const baseUrl = port ? `${host}:${port}` : host;
      const roleBindingName = `${entityId}-role-binding`;

      const namespace = config?.namespace ?? providerInputs.namespace.split(",")[0].trim();

      if (providerInputs.roleType === KubernetesRoleType.Role) {
        await axios.delete(
          `${baseUrl}/apis/rbac.authorization.k8s.io/v1/namespaces/${namespace}/rolebindings/${roleBindingName}`,
          {
            headers: {
              "Content-Type": "application/json",
              ...(providerInputs.authMethod === KubernetesAuthMethod.Gateway
                ? { "x-infisical-action": GatewayHttpProxyActions.UseGatewayK8sServiceAccount }
                : { Authorization: `Bearer ${providerInputs.clusterToken}` })
            },
            ...(providerInputs.authMethod === KubernetesAuthMethod.Api
              ? {
                  httpsAgent
                }
              : {}),
            signal: AbortSignal.timeout(EXTERNAL_REQUEST_TIMEOUT),
            timeout: EXTERNAL_REQUEST_TIMEOUT
          }
        );
      } else {
        await axios.delete(`${baseUrl}/apis/rbac.authorization.k8s.io/v1/clusterrolebindings/${roleBindingName}`, {
          headers: {
            "Content-Type": "application/json",
            ...(providerInputs.authMethod === KubernetesAuthMethod.Gateway
              ? { "x-infisical-action": GatewayHttpProxyActions.UseGatewayK8sServiceAccount }
              : { Authorization: `Bearer ${providerInputs.clusterToken}` })
          },
          ...(providerInputs.authMethod === KubernetesAuthMethod.Api
            ? {
                httpsAgent
              }
            : {}),
          signal: AbortSignal.timeout(EXTERNAL_REQUEST_TIMEOUT),
          timeout: EXTERNAL_REQUEST_TIMEOUT
        });
      }

      // Delete the service account
      await axios.delete(`${baseUrl}/api/v1/namespaces/${namespace}/serviceaccounts/${entityId}`, {
        headers: {
          "Content-Type": "application/json",
          ...(providerInputs.authMethod === KubernetesAuthMethod.Gateway
            ? { "x-infisical-action": GatewayHttpProxyActions.UseGatewayK8sServiceAccount }
            : { Authorization: `Bearer ${providerInputs.clusterToken}` })
        },
        ...(providerInputs.authMethod === KubernetesAuthMethod.Api
          ? {
              httpsAgent
            }
          : {}),
        signal: AbortSignal.timeout(EXTERNAL_REQUEST_TIMEOUT),
        timeout: EXTERNAL_REQUEST_TIMEOUT
      });
    };

    if (providerInputs.credentialType === KubernetesCredentialType.Dynamic) {
      const rawUrl =
        providerInputs.authMethod === KubernetesAuthMethod.Gateway
          ? GATEWAY_AUTH_DEFAULT_URL
          : providerInputs.url || "";

      const url = new URL(rawUrl);
      const k8sGatewayHost = url.hostname;
      const k8sPort = url.port ? Number(url.port) : 443;
      const k8sHost = `${url.protocol}//${url.hostname}`;

      const httpsAgent =
        providerInputs.ca && providerInputs.sslEnabled
          ? new https.Agent({
              ca: providerInputs.ca,
              rejectUnauthorized: true
            })
          : undefined;

      if (providerInputs.gatewayId) {
        if (providerInputs.authMethod === KubernetesAuthMethod.Gateway) {
          await $gatewayProxyWrapper(
            {
              gatewayId: providerInputs.gatewayId,
              targetHost: k8sHost,
              targetPort: k8sPort,
              httpsAgent,
              reviewTokenThroughGateway: true
            },
            serviceAccountDynamicCallback
          );
        } else {
          await $gatewayProxyWrapper(
            {
              gatewayId: providerInputs.gatewayId,
              targetHost: k8sGatewayHost,
              targetPort: k8sPort,
              httpsAgent,
              reviewTokenThroughGateway: false
            },
            serviceAccountDynamicCallback
          );
        }
      } else {
        await serviceAccountDynamicCallback(k8sHost, k8sPort, httpsAgent);
      }
    }

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
