import https from "node:https";

import { request as httpRequest } from "@app/lib/config/request";
import { GatewayHttpProxyActions, GatewayProxyProtocol } from "@app/lib/gateway";
import { withGatewayV2Proxy } from "@app/lib/gateway-v2/gateway-v2";

import { TGatewayV2ConnectionDetails } from "../gateway-v2/gateway-v2-types";
import { TKubernetesRequestExecutor } from "./kubernetes-auth-fns";

const PROXY_TIMEOUT_MS = 10_000;
const PROXY_MAX_RESPONSE_BYTES = 64 * 1024;

// Where an in-cluster gateway finds its own API server. Carries a scheme to match what machine
// identity Kubernetes auth sends, and is only routing metadata: in gateway-reviewer mode the
// gateway resolves the address itself.
const IN_CLUSTER_API_SERVER = "https://kubernetes.default.svc.cluster.local";

// The proxy target is baked into the client certificate the resolver mints, so the resolver and the
// executor have to agree on it. Both derive it from here.
export const resolveKubernetesProxyTarget = (kubernetesHost?: string) => {
  if (!kubernetesHost) return { targetHost: IN_CLUSTER_API_SERVER, targetPort: 443 };

  const parsed = new URL(kubernetesHost.includes("://") ? kubernetesHost : `https://${kubernetesHost}`);
  return { targetHost: parsed.hostname, targetPort: parsed.port ? Number(parsed.port) : 443 };
};

type TBuildInput = {
  connectionDetails: TGatewayV2ConnectionDetails;
  // Omitted in gateway-reviewer mode, where the gateway calls its own API server.
  kubernetesHost?: string;
  caCertificate?: string;
  verifyTlsCertificate?: boolean;
};

// Routes TokenReview traffic through a gateway instead of straight out from Infisical, for clusters
// whose API server we cannot reach. Two shapes, matching machine identity Kubernetes auth:
//
//   no kubernetesHost -> HTTP proxy, and the gateway performs the review with its own service
//                        account. Only valid when that gateway runs as a pod in the cluster.
//   kubernetesHost    -> TCP tunnel to that address, and Infisical performs the review as usual.
//                        Works from any gateway that can reach the API server.
export const buildGatewayKubernetesExecutor = ({
  connectionDetails,
  kubernetesHost,
  caCertificate,
  verifyTlsCertificate
}: TBuildInput): TKubernetesRequestExecutor => {
  const isGatewayReviewer = !kubernetesHost;
  const { targetHost } = resolveKubernetesProxyTarget(kubernetesHost);

  // In gateway-reviewer mode the gateway presents its own credentials at the far end, so there is
  // no TLS session for us to configure here.
  const httpsAgent = isGatewayReviewer
    ? undefined
    : new https.Agent({
        ca: caCertificate || undefined,
        rejectUnauthorized: verifyTlsCertificate ?? true,
        servername: targetHost
      });

  return async <T>(method: "get" | "post", path: string, body?: object, headers?: Record<string, string>) =>
    withGatewayV2Proxy(
      async (port) => {
        const url = `${isGatewayReviewer ? "http" : "https"}://localhost:${port}${path}`;
        const config = {
          headers: {
            ...headers,
            ...(isGatewayReviewer ? { "x-infisical-action": GatewayHttpProxyActions.UseGatewayK8sServiceAccount } : {})
          },
          httpsAgent,
          timeout: PROXY_TIMEOUT_MS,
          signal: AbortSignal.timeout(PROXY_TIMEOUT_MS),
          maxContentLength: PROXY_MAX_RESPONSE_BYTES,
          validateStatus: () => true
        };

        const res =
          method === "get" ? await httpRequest.get<T>(url, config) : await httpRequest.post<T>(url, body, config);
        return { status: res.status, data: res.data };
      },
      {
        protocol: isGatewayReviewer ? GatewayProxyProtocol.Http : GatewayProxyProtocol.Tcp,
        relayHost: connectionDetails.relayHost,
        gateway: connectionDetails.gateway,
        relay: connectionDetails.relay,
        httpsAgent
      }
    );
};
