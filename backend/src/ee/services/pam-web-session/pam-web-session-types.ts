import { AuditLogInfo } from "@app/ee/services/audit-log/audit-log-types";
import { ProjectServiceActor } from "@app/lib/types";

export const DEFAULT_WEB_SESSION_DURATION_MS = 60 * 60 * 1000; // 1 hour

export type TCreateWebSessionDTO = {
  accountId: string;
  projectId: string;
  orgId: string;
  actor: ProjectServiceActor;
  actorEmail: string;
  actorName: string;
  actorIp: string;
  actorUserAgent: string;
  auditLogInfo: AuditLogInfo;
};

export type TScreenshotEntry = {
  timestamp: Date;
  eventType: "screenshot";
  image: string; // base64 JPEG
};

export type TActiveTunnel = {
  localPort: number;
  cleanup: () => Promise<void>;
  targetUrl: string;
  projectId: string;
  expiresAt: Date;
  screenshots: TScreenshotEntry[];
  relayCerts: {
    relayHost: string;
    relay: { clientCertificate: string; clientPrivateKey: string; serverCertificateChain: string };
    gateway: { clientCertificate: string; clientPrivateKey: string; serverCertificateChain: string };
  };
};
