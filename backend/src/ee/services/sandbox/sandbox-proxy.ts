import http from "node:http";
import https from "node:https";
import { createServer as createNetServer, Socket } from "node:net";
import tls from "node:tls";

import { logger } from "@app/lib/logger";

import { recordSandboxProxyEvent } from "./sandbox-command-log";
import { SandboxCredentialRole } from "./sandbox-integrations";
import { createSandboxCa, TSandboxCa } from "./sandbox-proxy-ca";
import { TSandboxIntegration } from "./sandbox-types";

/**
 * The sandbox's egress proxy. The sandbox holds a placeholder; the real secret is only added here,
 * on the way out, and only for hosts a granted integration covers. Anything else is refused, so a
 * prompt-injected agent has nowhere to send data.
 *
 * TLS is terminated so headers can be rewritten, which is why each sandbox gets its own CA.
 */

export type TProxyDecision = "brokered" | "blocked" | "error";

export type TProxyLogEntry = {
  at: string;
  decision: TProxyDecision;
  method: string;
  host: string;
  path: string;
  status?: number;
  integration?: string;
  credential?: string;
};

type TResolvedIntegration = TSandboxIntegration & { secretValue: string };

type TSandboxProxyState = {
  sandboxId: string;
  server: http.Server;
  port: number;
  ca: TSandboxCa;
  integrations: TResolvedIntegration[];
  log: TProxyLogEntry[];
};

const MAX_LOG_ENTRIES = 200;
const states = new Map<string, TSandboxProxyState>();

/** Host pattern grammar mirrors the Agent Proxy: `host[:port][/path]`, `*.` matches one label. */
const matchesHost = (pattern: string, host: string, path: string) => {
  const [hostPart, ...pathParts] = pattern.split("/");
  const [patternHost, patternPort] = hostPart.split(":");
  const [actualHost, actualPort] = host.split(":");

  if (patternPort && patternPort !== (actualPort || "443")) return false;

  const hostMatches = patternHost.startsWith("*.")
    ? actualHost.toLowerCase().endsWith(patternHost.slice(1).toLowerCase()) &&
      actualHost.split(".").length === patternHost.split(".").length
    : actualHost.toLowerCase() === patternHost.toLowerCase();

  if (!hostMatches) return false;
  if (!pathParts.length) return true;

  const prefix = `/${pathParts.join("/")}`.replace(/\*$/, "");
  return path.startsWith(prefix);
};

const findIntegration = (state: TSandboxProxyState, host: string, path: string) =>
  state.integrations.find((integration) => integration.hostnames.some((pattern) => matchesHost(pattern, host, path)));

const record = (state: TSandboxProxyState, entry: TProxyLogEntry) => {
  state.log.unshift(entry);
  if (state.log.length > MAX_LOG_ENTRIES) state.log.pop();

  // The audit log shows requests and commands on one timeline: a command line says what was run,
  // this says which host it actually reached and which secret was attached on the way out.
  recordSandboxProxyEvent(state.sandboxId, entry);
};

const applyCredential = (headers: http.IncomingHttpHeaders, integration: TResolvedIntegration) => {
  const { credential, secretValue } = integration;
  if (credential.role !== SandboxCredentialRole.HeaderRewrite) return undefined;

  const name = credential.headerName ?? "Authorization";
  const prefix = credential.headerPrefix ? `${credential.headerPrefix} ` : "";

  // Set, not append: whatever placeholder the agent sent is discarded here.
  // eslint-disable-next-line no-param-reassign
  headers[name.toLowerCase()] = `${prefix}${secretValue}`;
  return name;
};

/** Forwards one already-decrypted request upstream, applying the credential if a grant matches. */
const forward = (state: TSandboxProxyState, req: http.IncomingMessage, res: http.ServerResponse, host: string) => {
  const path = req.url ?? "/";
  const integration = findIntegration(state, host, path);
  const [hostname, port] = host.split(":");

  if (!integration) {
    record(state, {
      at: new Date().toISOString(),
      decision: "blocked",
      method: req.method ?? "GET",
      host,
      path,
      status: 403
    });

    res.writeHead(403, { "content-type": "application/json" });
    res.end(
      JSON.stringify({
        error: "blocked_by_infisical_sandbox",
        message: `This sandbox is not granted access to ${hostname}.`
      })
    );
    return;
  }

  const headers = { ...req.headers };
  delete headers.host;
  headers.host = hostname;
  const credentialHeader = applyCredential(headers, integration);

  const upstream = https.request(
    { hostname, port: port ? Number(port) : 443, path, method: req.method, headers },
    (upstreamRes) => {
      record(state, {
        at: new Date().toISOString(),
        decision: "brokered",
        method: req.method ?? "GET",
        host,
        path,
        status: upstreamRes.statusCode,
        integration: integration.type,
        credential: credentialHeader
      });

      res.writeHead(upstreamRes.statusCode ?? 502, upstreamRes.headers);
      upstreamRes.pipe(res);
    }
  );

  upstream.on("error", (error) => {
    record(state, {
      at: new Date().toISOString(),
      decision: "error",
      method: req.method ?? "GET",
      host,
      path,
      status: 502
    });
    logger.error(error, `Sandbox proxy upstream failed [host=${host}]`);
    res.writeHead(502).end("upstream error");
  });

  req.pipe(upstream);
};

export const startSandboxProxy = async (
  sandboxId: string,
  integrations: TResolvedIntegration[]
): Promise<{ port: number; certificatePem: string }> => {
  const ca = await createSandboxCa(sandboxId);
  const server = http.createServer();

  const state: TSandboxProxyState = { sandboxId, server, port: 0, ca, integrations, log: [] };

  // Plain HTTP through a forward proxy arrives with an absolute URL.
  server.on("request", (req, res) => {
    const url = new URL(req.url?.startsWith("http") ? req.url : `http://${req.headers.host}${req.url}`);
    req.url = url.pathname + url.search;
    forward(state, req, res, url.host);
  });

  // HTTPS arrives as CONNECT. Terminate it with a certificate for the requested host so the
  // request inside can be read and rewritten.
  server.on("connect", (req: http.IncomingMessage, clientSocket: Socket) => {
    const host = req.url ?? "";
    const [hostname] = host.split(":");

    void ca
      .issue(hostname)
      .then(({ key, cert }) => {
        clientSocket.write("HTTP/1.1 200 Connection Established\r\n\r\n");

        const tlsServer = new tls.TLSSocket(clientSocket, { isServer: true, key, cert });
        const inner = http.createServer();
        inner.on("request", (innerReq, innerRes) => forward(state, innerReq, innerRes, host));
        inner.emit("connection", tlsServer);

        tlsServer.on("error", () => clientSocket.destroy());
      })
      .catch((error: Error) => {
        logger.error(error, `Sandbox proxy could not issue a certificate [host=${hostname}]`);
        clientSocket.destroy();
      });
  });

  const port = await new Promise<number>((resolve, reject) => {
    const probe = createNetServer();
    probe.once("error", reject);
    // Bound to every interface, not loopback: the sandbox is a separate container now, so it reaches
    // the proxy over the sandbox network rather than through the API's own localhost.
    probe.listen(0, "0.0.0.0", () => {
      const assigned = (probe.address() as { port: number }).port;
      probe.close(() => server.listen(assigned, "0.0.0.0", () => resolve(assigned)));
    });
  });

  state.port = port;
  states.set(sandboxId, state);
  logger.info(`Sandbox proxy listening [sandboxId=${sandboxId}] [port=${port}]`);

  return { port, certificatePem: ca.certificatePem };
};

export const stopSandboxProxy = (sandboxId: string) => {
  const state = states.get(sandboxId);
  if (!state) return;

  states.delete(sandboxId);
  state.server.close();
};

export const getSandboxProxyLog = (sandboxId: string) => states.get(sandboxId)?.log ?? [];
