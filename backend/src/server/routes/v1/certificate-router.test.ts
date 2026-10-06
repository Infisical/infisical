import Fastify, { FastifyInstance } from "fastify";
import { afterEach, describe, expect, it, vi } from "vitest";

import { serializerCompiler, validatorCompiler, ZodTypeProvider } from "@app/server/plugins/fastify-zod";
import { ActorType, AuthMethod, AuthMode } from "@app/services/auth/auth-type";
import { CertificateRequestStatus } from "@app/services/certificate-request/certificate-request-types";

import { registerCertificateRouter } from "./certificate-router";

describe.each([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN])(
  "certificate request polling route with %s",
  (authMode) => {
    let app: FastifyInstance;
    const actor = authMode === AuthMode.IDENTITY_ACCESS_TOKEN ? ActorType.IDENTITY : ActorType.USER;
    const requestId = "550e8400-e29b-41d4-a716-446655440005";
    const certificate = "-----BEGIN CERTIFICATE-----\nMOCK_CERT_PEM\n-----END CERTIFICATE-----";
    const certificateChain =
      "-----BEGIN CERTIFICATE-----\nMOCK_INTERMEDIATE_PEM\n-----END CERTIFICATE-----\n-----BEGIN CERTIFICATE-----\nMOCK_ROOT_PEM\n-----END CERTIFICATE-----";

    afterEach(async () => {
      await app?.close();
    });

    it.each([
      { status: CertificateRequestStatus.ISSUED, chain: certificateChain },
      { status: CertificateRequestStatus.ISSUED, chain: null },
      { status: CertificateRequestStatus.ISSUED, chain: "" },
      { status: CertificateRequestStatus.PENDING, chain: null },
      { status: CertificateRequestStatus.FAILED, chain: null }
    ])("serializes certificateChain for $status requests with chain $chain", async ({ status, chain }) => {
      const issued = status === CertificateRequestStatus.ISSUED;
      const result = {
        status,
        certificate: issued ? certificate : null,
        certificateChain: chain,
        certificateId: issued ? "550e8400-e29b-41d4-a716-446655440006" : null,
        privateKey: issued ? "-----BEGIN PRIVATE KEY-----\nMOCK_KEY_PEM\n-----END PRIVATE KEY-----" : null,
        serialNumber: issued ? "123456" : null,
        errorMessage: status === CertificateRequestStatus.FAILED ? "Certificate issuance failed" : null,
        pendingMessage: status === CertificateRequestStatus.PENDING ? "Waiting for CA" : null,
        commonName: "example.com",
        organization: "Example",
        organizationalUnit: "Engineering",
        country: "US",
        state: "CA",
        locality: "San Francisco",
        domainComponents: ["example", "com"],
        basicConstraints: { isCA: false },
        customExtensions: null,
        metadata: [{ key: "owner", value: "certificate-agent" }],
        createdAt: new Date(),
        updatedAt: new Date()
      };
      const getCertificateFromRequest = vi
        .fn()
        .mockResolvedValue({ certificateRequest: result, projectId: "project-id" });
      const createAuditLog = vi.fn().mockResolvedValue(undefined);

      app = Fastify({ logger: false }).withTypeProvider<ZodTypeProvider>();
      app.setValidatorCompiler(validatorCompiler);
      app.setSerializerCompiler(serializerCompiler);
      app.decorate("services", {
        certificateRequest: { getCertificateFromRequest },
        auditLog: { createAuditLog }
      } as never);
      app.addHook("onRequest", async (req) => {
        Object.assign(req, {
          auth: { authMode },
          permission: { type: actor, id: "actor-id", authMethod: AuthMethod.EMAIL, orgId: "org-id" },
          auditLogInfo: {}
        });
      });
      await app.register(registerCertificateRouter as never, { prefix: "/api/v1/cert-manager/certificates" });

      const response = await app.inject({
        method: "GET",
        url: `/api/v1/cert-manager/certificates/certificate-requests/${requestId}`
      });

      expect(response.statusCode).toBe(200);
      expect(response.json<unknown>()).toEqual({
        ...result,
        createdAt: result.createdAt.toISOString(),
        updatedAt: result.updatedAt.toISOString()
      });
      expect(getCertificateFromRequest).toHaveBeenCalledWith({
        actor,
        actorId: "actor-id",
        actorAuthMethod: AuthMethod.EMAIL,
        actorOrgId: "org-id",
        certificateRequestId: requestId
      });
      expect(createAuditLog).toHaveBeenCalledOnce();
    });
  }
);
