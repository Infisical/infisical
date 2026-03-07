import http from "node:http";

import { ForbiddenError, subject } from "@casl/ability";

import { ActionProjectType } from "@app/db/schemas";
import { EventType, TAuditLogServiceFactory } from "@app/ee/services/audit-log/audit-log-types";
import { TGatewayV2ServiceFactory } from "@app/ee/services/gateway-v2/gateway-v2-service";
import { PamResource } from "@app/ee/services/pam-resource/pam-resource-enums";
import { TPermissionServiceFactory } from "@app/ee/services/permission/permission-service-types";
import {
  ProjectPermissionPamAccountActions,
  ProjectPermissionSub
} from "@app/ee/services/permission/project-permission";
import { BadRequestError, NotFoundError } from "@app/lib/errors";
import { GatewayProxyProtocol } from "@app/lib/gateway/types";
import { createGatewayConnection, createRelayConnection, setupRelayServer } from "@app/lib/gateway-v2/gateway-v2";
import { logger } from "@app/lib/logger";
import { ActorType } from "@app/services/auth/auth-type";
import { TKmsServiceFactory } from "@app/services/kms/kms-service";
import { KmsDataKey } from "@app/services/kms/kms-types";
import { TPamSessionExpirationServiceFactory } from "@app/services/pam-session-expiration/pam-session-expiration-queue";
import { TUserDALFactory } from "@app/services/user/user-dal";

import { TPamAccountDALFactory } from "../pam-account/pam-account-dal";
import { TPamResourceDALFactory } from "../pam-resource/pam-resource-dal";
import { decryptResourceConnectionDetails } from "../pam-resource/pam-resource-fns";
import { TWebAppResourceConnectionDetails } from "../pam-resource/webapp/webapp-resource-types";
import { TPamSessionDALFactory } from "../pam-session/pam-session-dal";
import { PamSessionStatus } from "../pam-session/pam-session-enums";
import {
  DEFAULT_WEB_SESSION_DURATION_MS,
  TActiveTunnel,
  TCreateWebSessionDTO,
  TScreenshotEntry
} from "./pam-web-session-types";

// In-memory map of active tunnels: sessionId -> tunnel info
const activeTunnels = new Map<string, TActiveTunnel>();

type TPamWebSessionServiceFactoryDep = {
  pamAccountDAL: Pick<TPamAccountDALFactory, "findById" | "findMetadataByAccountIds">;
  pamResourceDAL: Pick<TPamResourceDALFactory, "findById">;
  permissionService: Pick<TPermissionServiceFactory, "getProjectPermission">;
  auditLogService: Pick<TAuditLogServiceFactory, "createAuditLog">;
  pamSessionDAL: Pick<TPamSessionDALFactory, "create" | "updateById" | "findById">;
  pamSessionExpirationService: Pick<TPamSessionExpirationServiceFactory, "scheduleSessionExpiration">;
  gatewayV2Service: Pick<TGatewayV2ServiceFactory, "getPAMConnectionDetails">;
  kmsService: Pick<TKmsServiceFactory, "createCipherPairWithDataKey">;
  userDAL: Pick<TUserDALFactory, "findById">;
};

export type TPamWebSessionServiceFactory = ReturnType<typeof pamWebSessionServiceFactory>;

export const pamWebSessionServiceFactory = ({
  pamAccountDAL,
  pamResourceDAL,
  permissionService,
  auditLogService,
  pamSessionDAL,
  pamSessionExpirationService,
  gatewayV2Service,
  kmsService,
  userDAL
}: TPamWebSessionServiceFactoryDep) => {
  const createWebSession = async ({
    accountId,
    projectId,
    orgId,
    actor,
    actorEmail,
    actorName,
    actorIp,
    actorUserAgent,
    auditLogInfo
  }: TCreateWebSessionDTO) => {
    // 1. VALIDATE
    const account = await pamAccountDAL.findById(accountId);
    if (!account || account.projectId !== projectId) {
      throw new NotFoundError({ message: `Account with ID '${accountId}' not found` });
    }

    const resource = await pamResourceDAL.findById(account.resourceId);
    if (!resource) {
      throw new NotFoundError({ message: `Resource not found` });
    }

    if (resource.resourceType !== PamResource.WebApp) {
      throw new BadRequestError({ message: "Web sessions are only supported for Web Application resources" });
    }

    if (!resource.gatewayId) {
      throw new BadRequestError({ message: "Gateway not configured for this resource" });
    }

    // Check permissions
    const { permission } = await permissionService.getProjectPermission({
      actor: actor.type,
      actorId: actor.id,
      actorAuthMethod: actor.authMethod,
      actorOrgId: actor.orgId,
      projectId: account.projectId,
      actionProjectType: ActionProjectType.PAM
    });

    const accountMeta = await pamAccountDAL.findMetadataByAccountIds([account.id]);

    ForbiddenError.from(permission).throwUnlessCan(
      ProjectPermissionPamAccountActions.Access,
      subject(ProjectPermissionSub.PamAccounts, {
        resourceName: resource.name,
        accountName: account.name,
        metadata: accountMeta[account.id] || []
      })
    );

    // 2. DECRYPT connection details
    const connectionDetails = (await decryptResourceConnectionDetails({
      projectId,
      encryptedConnectionDetails: resource.encryptedConnectionDetails,
      kmsService
    })) as TWebAppResourceConnectionDetails;

    // 3. Parse target URL to get host/port for the gateway cert
    const targetUrl = new URL(connectionDetails.url);
    const targetHost = targetUrl.hostname;
    const targetPort = targetUrl.port
      ? parseInt(targetUrl.port, 10)
      : targetUrl.protocol === "https:" ? 443 : 80;

    // 4. CREATE SESSION
    const user = await userDAL.findById(actor.id);
    const expiresAt = new Date(Date.now() + DEFAULT_WEB_SESSION_DURATION_MS);

    const session = await pamSessionDAL.create({
      status: PamSessionStatus.Starting,
      accessMethod: "web",
      expiresAt,
      accountName: account.name,
      actorEmail,
      actorIp,
      actorName,
      actorUserAgent,
      projectId,
      resourceName: resource.name,
      resourceType: resource.resourceType,
      accountId: account.id,
      userId: actor.id
    });

    await pamSessionExpirationService.scheduleSessionExpiration(session.id, expiresAt);

    // 5. GET CERTIFICATES
    const certs = await gatewayV2Service.getPAMConnectionDetails({
      gatewayId: resource.gatewayId,
      sessionId: session.id,
      resourceType: PamResource.WebApp,
      host: targetHost,
      port: targetPort,
      duration: DEFAULT_WEB_SESSION_DURATION_MS,
      actorMetadata: {
        id: actor.id,
        type: ActorType.USER,
        name: user?.email ?? ""
      }
    });

    if (!certs) {
      throw new BadRequestError({ message: "Failed to obtain gateway connection details" });
    }

    // 6. START TUNNEL
    logger.info({ relayHost: certs.relayHost, targetHost, targetPort }, "Opening HTTP proxy tunnel");
    const relayServer = await setupRelayServer({
      protocol: GatewayProxyProtocol.Http,
      relayHost: certs.relayHost,
      relay: certs.relay,
      gateway: certs.gateway,
      longLived: true
    });

    // 7. Store tunnel in memory
    activeTunnels.set(session.id, {
      localPort: relayServer.port,
      cleanup: relayServer.cleanup,
      targetUrl: connectionDetails.url,
      projectId,
      expiresAt,
      screenshots: [],
      relayCerts: {
        relayHost: certs.relayHost,
        relay: certs.relay,
        gateway: certs.gateway
      }
    });

    // 8. Schedule cleanup
    setTimeout(() => {
      void cleanupSession(session.id);
    }, DEFAULT_WEB_SESSION_DURATION_MS);

    // 9. ACTIVATE SESSION
    await pamSessionDAL.updateById(session.id, {
      status: PamSessionStatus.Active,
      startedAt: new Date()
    });

    await auditLogService.createAuditLog({
      ...auditLogInfo,
      orgId,
      projectId,
      event: {
        type: EventType.PAM_ACCOUNT_ACCESS,
        metadata: {
          accountId,
          resourceName: resource.name,
          accountName: account.name,
          duration: expiresAt.toISOString()
        }
      }
    });

    logger.info({ sessionId: session.id, accountId }, "Web proxy session created");

    return { sessionId: session.id };
  };

  const cleanupSession = async (sessionId: string) => {
    const tunnel = activeTunnels.get(sessionId);
    if (tunnel) {
      // Save screenshots to the session (stored in-memory, encrypted to DB on cleanup)
      if (tunnel.screenshots.length > 0) {
        try {
          // Read existing logs from DB (gateway may have uploaded HTTP logs already)
          let existingLogs: unknown[] = [];
          const session = await pamSessionDAL.findById(sessionId);
          if (session?.encryptedLogsBlob) {
            const { decryptor } = await kmsService.createCipherPairWithDataKey({
              type: KmsDataKey.SecretManager,
              projectId: tunnel.projectId
            });
            const plainText = decryptor({ cipherTextBlob: session.encryptedLogsBlob });
            existingLogs = JSON.parse(plainText.toString()) as unknown[];
          }

          // Merge existing logs with screenshots
          const mergedLogs = [...existingLogs, ...tunnel.screenshots];

          const { encryptor } = await kmsService.createCipherPairWithDataKey({
            type: KmsDataKey.SecretManager,
            projectId: tunnel.projectId
          });
          const { cipherTextBlob } = encryptor({
            plainText: Buffer.from(JSON.stringify(mergedLogs))
          });

          await pamSessionDAL.updateById(sessionId, { encryptedLogsBlob: cipherTextBlob });
          logger.info({ sessionId, screenshotCount: tunnel.screenshots.length }, "Saved screenshots to session");
        } catch (err) {
          logger.error(err, "Failed to save screenshots");
        }
      }

      try {
        await tunnel.cleanup();
      } catch (err) {
        logger.debug(err, "Error cleaning up tunnel");
      }

      // Best-effort session cancellation signal to gateway
      try {
        const relayConn = await createRelayConnection({
          relayHost: tunnel.relayCerts.relayHost,
          clientCertificate: tunnel.relayCerts.relay.clientCertificate,
          clientPrivateKey: tunnel.relayCerts.relay.clientPrivateKey,
          serverCertificateChain: tunnel.relayCerts.relay.serverCertificateChain
        });
        const cancelConn = await createGatewayConnection(
          relayConn,
          tunnel.relayCerts.gateway,
          GatewayProxyProtocol.PamSessionCancellation
        );
        cancelConn.end();
        relayConn.destroy();
      } catch (err) {
        logger.debug(err, "Session cancellation signal failed (best-effort)");
      }

      activeTunnels.delete(sessionId);
    }

    try {
      await pamSessionDAL.updateById(sessionId, {
        status: PamSessionStatus.Ended,
        endedAt: new Date()
      });
    } catch (err) {
      logger.debug(err, "Error updating session status");
    }
  };

  const proxyRequest = async (
    sessionId: string,
    path: string,
    method: string,
    headers: Record<string, string | string[] | undefined>,
    body: Buffer | null
  ): Promise<{
    statusCode: number;
    headers: http.IncomingHttpHeaders;
    body: Buffer;
  }> => {
    const tunnel = activeTunnels.get(sessionId);
    if (!tunnel) {
      throw new NotFoundError({ message: "Session not found or tunnel not available" });
    }

    if (new Date() > tunnel.expiresAt) {
      void cleanupSession(sessionId);
      throw new BadRequestError({ message: "Session has expired" });
    }

    // Build the request path (what the gateway expects)
    const requestPath = path.startsWith("/") ? path : `/${path}`;

    logger.info({ sessionId, localPort: tunnel.localPort, method, path: requestPath, targetUrl: tunnel.targetUrl }, "Proxying request");

    return new Promise((resolve, reject) => {
      const options: http.RequestOptions = {
        hostname: "localhost",
        port: tunnel.localPort,
        path: requestPath,
        method,
        headers: {
          ...headers,
          // Override host to match the internal target
          host: new URL(tunnel.targetUrl).host,
          // Close connection after response — each request gets its own tunnel connection
          connection: "close"
        }
      };

      // Remove headers that shouldn't be forwarded
      delete options.headers!["transfer-encoding"];

      const proxyReq = http.request(options, (proxyRes) => {
        const chunks: Buffer[] = [];
        proxyRes.on("data", (chunk: Buffer) => chunks.push(chunk));
        proxyRes.on("end", () => {
          resolve({
            statusCode: proxyRes.statusCode ?? 502,
            headers: proxyRes.headers,
            body: Buffer.concat(chunks)
          });
        });
        proxyRes.on("error", reject);
      });

      proxyReq.on("error", (err) => {
        reject(new BadRequestError({ message: `Proxy request failed: ${err.message}` }));
      });

      proxyReq.setTimeout(30000, () => {
        proxyReq.destroy();
        reject(new BadRequestError({ message: "Proxy request timed out" }));
      });

      if (body && body.length > 0) {
        proxyReq.write(body);
      }
      proxyReq.end();
    });
  };

  const getTunnel = (sessionId: string): TActiveTunnel | undefined => {
    return activeTunnels.get(sessionId);
  };

  const storeScreenshot = (sessionId: string, imageBuffer: Buffer) => {
    const tunnel = activeTunnels.get(sessionId);
    if (!tunnel) return;

    const base64Image = imageBuffer.toString("base64");
    tunnel.screenshots.push({
      timestamp: new Date(),
      eventType: "screenshot",
      image: base64Image
    });

    logger.info({ sessionId, screenshotCount: tunnel.screenshots.length, sizeKB: Math.round(imageBuffer.length / 1024) }, "Screenshot captured");
  };

  return {
    createWebSession,
    proxyRequest,
    cleanupSession,
    getTunnel,
    storeScreenshot
  };
};
