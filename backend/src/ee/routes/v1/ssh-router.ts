import ms from "ms";
import { z } from "zod";

import { EventType } from "@app/ee/services/audit-log/audit-log-types";
import { SshCertType } from "@app/ee/services/ssh/ssh-certificate-authority-types";
import { CERTIFICATE_AUTHORITIES, CERTIFICATE_TEMPLATES } from "@app/lib/api-docs"; // TODO: update to SSH CA
import { writeLimit } from "@app/server/config/rateLimiter";
import { verifyAuth } from "@app/server/plugins/auth/verify-auth";
import { AuthMode } from "@app/services/auth/auth-type";
import { CertKeyAlgorithm } from "@app/services/certificate/certificate-types";

export const registerSshRouter = async (server: FastifyZodProvider) => {
  server.route({
    method: "POST",
    url: "/sign",
    config: {
      rateLimit: writeLimit
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]),
    schema: {
      description: "Sign SSH public key",
      body: z.object({
        name: z.string(), // name of SSH certificate template
        publicKey: z.string(),
        certType: z.nativeEnum(SshCertType).default(SshCertType.USER),
        principals: z.array(z.string().transform((val) => val.trim())).nonempty("Principals array must not be empty"),
        ttl: z
          .string()
          .refine((val) => ms(val) > 0, "TTL must be a positive number")
          .optional()
          .describe(CERTIFICATE_TEMPLATES.CREATE.ttl),
        keyId: z.string().optional()
      }),
      response: {
        200: z.object({
          serialNumber: z.string(),
          signedKey: z.string()
        })
      }
    },
    handler: async (req) => {
      const { serialNumber, signedPublicKey, certificateTemplate, ttl, keyId } =
        await server.services.sshCertificateAuthority.signSshKey({
          actor: req.permission.type,
          actorId: req.permission.id,
          actorAuthMethod: req.permission.authMethod,
          actorOrgId: req.permission.orgId,
          ...req.body
        });

      await server.services.auditLog.createAuditLog({
        ...req.auditLogInfo,
        orgId: req.permission.orgId,
        event: {
          type: EventType.SIGN_SSH_KEY,
          metadata: {
            certificateTemplateId: certificateTemplate.id,
            certType: req.body.certType,
            principals: req.body.principals,
            ttl: String(ttl),
            keyId
          }
        }
      });

      return {
        serialNumber,
        signedKey: signedPublicKey
      };
    }
  });

  server.route({
    method: "POST",
    url: "/issue",
    config: {
      rateLimit: writeLimit
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]),
    schema: {
      description: "Issue SSH credentials (certificate + key)",
      body: z.object({
        name: z.string(), // name of SSH certificate template
        keyAlgorithm: z
          .nativeEnum(CertKeyAlgorithm)
          .default(CertKeyAlgorithm.RSA_2048)
          .describe(CERTIFICATE_AUTHORITIES.CREATE.keyAlgorithm),
        certType: z.nativeEnum(SshCertType).default(SshCertType.USER),
        principals: z.array(z.string().transform((val) => val.trim())).nonempty("Principals array must not be empty"),
        ttl: z
          .string()
          .refine((val) => ms(val) > 0, "TTL must be a positive number")
          .optional()
          .describe(CERTIFICATE_TEMPLATES.CREATE.ttl),
        keyId: z.string().optional()
      }),
      response: {
        200: z.object({
          serialNumber: z.string(),
          signedKey: z.string(),
          privateKey: z.string(),
          keyAlgorithm: z.nativeEnum(CertKeyAlgorithm)
        })
      }
    },
    handler: async (req) => {
      const { serialNumber, signedPublicKey, privateKey, publicKey, certificateTemplate, ttl, keyId } =
        await server.services.sshCertificateAuthority.issueSshCreds({
          actor: req.permission.type,
          actorId: req.permission.id,
          actorAuthMethod: req.permission.authMethod,
          actorOrgId: req.permission.orgId,
          ...req.body
        });

      await server.services.auditLog.createAuditLog({
        ...req.auditLogInfo,
        orgId: req.permission.orgId,
        event: {
          type: EventType.ISSUE_SSH_CREDS,
          metadata: {
            certificateTemplateId: certificateTemplate.id,
            keyAlgorithm: req.body.keyAlgorithm,
            certType: req.body.certType,
            principals: req.body.principals,
            ttl: String(ttl),
            keyId
          }
        }
      });

      return {
        serialNumber,
        signedKey: signedPublicKey,
        privateKey,
        publicKey,
        keyAlgorithm: req.body.keyAlgorithm
      };
    }
  });
};
