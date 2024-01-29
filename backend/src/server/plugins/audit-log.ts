import fp from "fastify-plugin";

import { UserAgentType } from "@app/ee/services/audit-log/audit-log-types";
import { BadRequestError } from "@app/lib/errors";
import { ActorType } from "@app/services/auth/auth-type";

export const getUserAgentType = (userAgent: string | undefined) => {
  if (userAgent === undefined) {
    return UserAgentType.OTHER;
  }
  if (userAgent === UserAgentType.CLI) {
    return UserAgentType.CLI;
  }
  if (userAgent === UserAgentType.K8_OPERATOR) {
    return UserAgentType.K8_OPERATOR;
  }
  if (userAgent === UserAgentType.TERRAFORM) {
    return UserAgentType.TERRAFORM;
  }
  if (userAgent.toLowerCase().includes("mozilla")) {
    return UserAgentType.WEB;
  }
  if (userAgent.includes(UserAgentType.NODE_SDK)) {
    return UserAgentType.NODE_SDK;
  }
  if (userAgent.includes(UserAgentType.PYTHON_SDK)) {
    return UserAgentType.PYTHON_SDK;
  }
  return UserAgentType.OTHER;
};

export const injectAuditLogInfo = fp(async (server: FastifyZodProvider) => {
  server.decorateRequest("auditLogInfo", null);
  server.addHook("onRequest", async (req) => {
    if (!req.auth) return;
    const userAgent = req.headers["user-agent"] ?? "";
    const payload = {
      ipAddress: req.realIp,
      userAgent,
      userAgentType: getUserAgentType(userAgent)
    } as typeof req.auditLogInfo;
    if (req.auth.actor === ActorType.USER) {
      payload.actor = {
        type: ActorType.USER,
        metadata: {
          email: req.auth.user.email,
          userId: req.permission.id
        }
      };
    } else if (req.auth.actor === ActorType.SERVICE) {
      payload.actor = {
        type: ActorType.SERVICE,
        metadata: {
          name: req.auth.serviceToken.name,
          serviceId: req.auth.serviceTokenId
        }
      };
    } else if (req.auth.actor === ActorType.IDENTITY) {
      payload.actor = {
        type: ActorType.IDENTITY,
        metadata: {
          name: req.auth.identityName,
          identityId: req.auth.identityId
        }
      };
    } else {
      throw new BadRequestError({ message: "Missing logic for other actor" });
    }
    req.auditLogInfo = payload;
  });
});
