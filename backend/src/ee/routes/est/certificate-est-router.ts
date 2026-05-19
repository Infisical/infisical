import { z } from "zod";

import { getConfig } from "@app/lib/config/env";
import { crypto } from "@app/lib/crypto/cryptography";
import { BadRequestError, NotFoundError, UnauthorizedError } from "@app/lib/errors";
import { readLimit, writeLimit } from "@app/server/config/rateLimiter";

export const registerCertificateEstRouter = async (server: FastifyZodProvider) => {
  const appCfg = getConfig();

  const getIdentifierType = async (identifier: string): Promise<"template" | "profile" | null> => {
    try {
      // Try to find as profile first using internal access
      await server.services.certificateProfile.getEstConfigurationByProfile({
        profileId: identifier,
        isInternal: true
      });
      return "profile";
    } catch (profileError) {
      try {
        await server.services.certificateTemplate.getEstConfiguration({
          isInternal: true,
          certificateTemplateId: identifier
        });
        return "template";
      } catch (templateError) {
        server.log.debug(
          {
            identifier,
            profileError: profileError instanceof Error ? profileError.message : "Unknown error",
            templateError: templateError instanceof Error ? templateError.message : "Unknown error"
          },
          "EST identifier not found as profile or template"
        );
        return null;
      }
    }
  };

  // add support for CSR bodies
  server.addContentTypeParser("application/pkcs10", { parseAs: "string" }, (_, body, done) => {
    try {
      let csrBody = body as string;
      // some EST clients send CSRs in PEM format and some in base64 format
      // for CSRs sent in PEM, we leave them as is
      // for CSRs sent in base64, we preprocess them to remove new lines and spaces
      if (!csrBody.includes("BEGIN CERTIFICATE REQUEST")) {
        csrBody = csrBody.replaceAll("\n", "").replaceAll(" ", "");
      }

      done(null, csrBody);
    } catch (err) {
      const error = err as Error;
      done(error, undefined);
    }
  });

  server.addHook("onRequest", async (req, res) => {
    const urlPath = req.url.split("?")[0];
    const lastFragment = urlPath.split("/").pop() ?? "";
    if (lastFragment === "simpleenroll" || lastFragment === "simplereenroll") {
      const contentType = (req.headers["content-type"] ?? "").toString().toLowerCase().split(";")[0].trim();
      if (contentType && contentType !== "application/pkcs10") {
        await res.code(415).type("text/plain").send("Content-Type must be application/pkcs10");
      }
    }
  });

  // Authenticate EST client using Passphrase
  // Using preHandler instead of onRequest ensures rate limiting (preValidation) runs first
  server.addHook("preHandler", async (req, res) => {
    const { authorization } = req.headers;

    const matchedRoute = req.routeOptions?.url ?? "";

    // cacerts endpoint should not have any authentication
    if (matchedRoute.endsWith("/cacerts")) {
      return;
    }

    if (!authorization) {
      const wwwAuthenticateHeader = "WWW-Authenticate";
      const errAuthRequired = "Authentication required";

      await res.hijack();

      // definitive connection timeout to clean-up open connections and prevent memory leak
      res.raw.setTimeout(10 * 1000, () => {
        res.raw.end();
      });

      res.raw.setHeader(wwwAuthenticateHeader, `Basic realm="infisical"`);
      res.raw.setHeader("Content-Length", 0);
      res.raw.statusCode = 401;

      // Write the error message to the response without ending the connection
      res.raw.write(errAuthRequired);

      // flush headers
      res.raw.flushHeaders();
      return;
    }

    const params =
      (req.params as { identifier?: string; applicationId?: string; profileId?: string }) ?? {};
    const isAppScoped = matchedRoute.startsWith("/applications/");

    let estConfig;
    if (isAppScoped) {
      const { applicationId, profileId } = params;
      if (!applicationId || !profileId) {
        throw new NotFoundError({ message: "Certificate profile not found" });
      }
      estConfig = await server.services.certificateProfile.getEstConfigurationByProfile({
        profileId,
        applicationId,
        isInternal: true
      });
    } else {
      const { identifier } = params;
      if (!identifier) {
        throw new NotFoundError({ message: "Certificate template or profile not found" });
      }

      const identifierType = await getIdentifierType(identifier);
      if (!identifierType) {
        throw new NotFoundError({ message: "Certificate template or profile not found" });
      }

      if (identifierType === "profile") {
        estConfig = await server.services.certificateProfile.getEstConfigurationByProfile({
          profileId: identifier,
          isInternal: true
        });
      } else {
        estConfig = await server.services.certificateTemplate.getEstConfiguration({
          isInternal: true,
          certificateTemplateId: identifier
        });
      }
    }

    if (!estConfig.isEnabled) {
      throw new BadRequestError({
        message: "EST is disabled"
      });
    }

    const rawCredential = authorization?.split(" ").pop();
    if (!rawCredential) {
      throw new UnauthorizedError({ message: "Missing HTTP credentials" });
    }

    // expected format is user:password
    const basicCredential = atob(rawCredential);
    const password = basicCredential.split(":").pop();
    if (!password) {
      throw new BadRequestError({
        message: "No password provided"
      });
    }

    const isPasswordValid = await crypto.hashing().compareHash(password, estConfig.hashedPassphrase);
    if (!isPasswordValid) {
      throw new UnauthorizedError({
        message: "Invalid credentials"
      });
    }
  });

  server.route({
    method: "POST",
    url: "/:identifier/simpleenroll",
    config: {
      rateLimit: writeLimit
    },
    schema: {
      body: z.string().min(1),
      params: z.object({
        identifier: z.string().min(1)
      }),
      response: {
        200: z.string()
      }
    },
    handler: async (req, res) => {
      void res.header("Content-Type", "application/pkcs7-mime; smime-type=certs-only");
      void res.header("Content-Transfer-Encoding", "base64");

      const { identifier } = req.params;
      const identifierType = await getIdentifierType(identifier);

      if (identifierType === "profile") {
        return server.services.certificateEstV3.simpleEnrollByProfile({
          csr: req.body,
          profileId: identifier,
          sslClientCert: req.headers[appCfg.SSL_CLIENT_CERTIFICATE_HEADER_KEY] as string
        });
      }
      return server.services.certificateEst.simpleEnroll({
        csr: req.body,
        certificateTemplateId: identifier,
        sslClientCert: req.headers[appCfg.SSL_CLIENT_CERTIFICATE_HEADER_KEY] as string
      });
    }
  });

  server.route({
    method: "POST",
    url: "/:identifier/simplereenroll",
    config: {
      rateLimit: writeLimit
    },
    schema: {
      body: z.string().min(1),
      params: z.object({
        identifier: z.string().min(1)
      }),
      response: {
        200: z.string()
      }
    },
    handler: async (req, res) => {
      void res.header("Content-Type", "application/pkcs7-mime; smime-type=certs-only");
      void res.header("Content-Transfer-Encoding", "base64");

      const { identifier } = req.params;
      const identifierType = await getIdentifierType(identifier);

      if (identifierType === "profile") {
        return server.services.certificateEstV3.simpleReenrollByProfile({
          csr: req.body,
          profileId: identifier,
          sslClientCert: req.headers[appCfg.SSL_CLIENT_CERTIFICATE_HEADER_KEY] as string
        });
      }
      return server.services.certificateEst.simpleReenroll({
        csr: req.body,
        certificateTemplateId: identifier,
        sslClientCert: req.headers[appCfg.SSL_CLIENT_CERTIFICATE_HEADER_KEY] as string
      });
    }
  });

  server.route({
    method: "GET",
    url: "/:identifier/cacerts",
    config: {
      rateLimit: readLimit
    },
    schema: {
      params: z.object({
        identifier: z.string().min(1)
      }),
      response: {
        200: z.string()
      }
    },
    handler: async (req, res) => {
      void res.header("Content-Type", "application/pkcs7-mime; smime-type=certs-only");
      void res.header("Content-Transfer-Encoding", "base64");

      // cacerts is the only EST endpoint reachable without the preHandler resolving
      // an identifier (it is unauthenticated per RFC 7030), so it validates here.
      const { identifier } = req.params;
      const identifierType = await getIdentifierType(identifier);

      if (!identifierType) {
        throw new NotFoundError({ message: "Certificate template or profile not found" });
      }

      if (identifierType === "profile") {
        return server.services.certificateEstV3.getCaCertsByProfile({
          profileId: identifier
        });
      }
      return server.services.certificateEst.getCaCerts({
        certificateTemplateId: identifier
      });
    }
  });

  server.route({
    method: "POST",
    url: "/applications/:applicationId/profiles/:profileId/simpleenroll",
    config: { rateLimit: writeLimit },
    schema: {
      body: z.string().min(1),
      params: z.object({
        applicationId: z.string().uuid(),
        profileId: z.string().uuid()
      }),
      response: { 200: z.string() }
    },
    handler: async (req, res) => {
      void res.header("Content-Type", "application/pkcs7-mime; smime-type=certs-only");
      void res.header("Content-Transfer-Encoding", "base64");
      const { applicationId, profileId } = req.params;
      return server.services.certificateEstV3.simpleEnrollByProfile({
        csr: req.body,
        profileId,
        applicationId,
        sslClientCert: req.headers[appCfg.SSL_CLIENT_CERTIFICATE_HEADER_KEY] as string
      });
    }
  });

  server.route({
    method: "POST",
    url: "/applications/:applicationId/profiles/:profileId/simplereenroll",
    config: { rateLimit: writeLimit },
    schema: {
      body: z.string().min(1),
      params: z.object({
        applicationId: z.string().uuid(),
        profileId: z.string().uuid()
      }),
      response: { 200: z.string() }
    },
    handler: async (req, res) => {
      void res.header("Content-Type", "application/pkcs7-mime; smime-type=certs-only");
      void res.header("Content-Transfer-Encoding", "base64");
      const { applicationId, profileId } = req.params;
      return server.services.certificateEstV3.simpleReenrollByProfile({
        csr: req.body,
        profileId,
        applicationId,
        sslClientCert: req.headers[appCfg.SSL_CLIENT_CERTIFICATE_HEADER_KEY] as string
      });
    }
  });

  server.route({
    method: "GET",
    url: "/applications/:applicationId/profiles/:profileId/cacerts",
    config: { rateLimit: readLimit },
    schema: {
      params: z.object({
        applicationId: z.string().uuid(),
        profileId: z.string().uuid()
      }),
      response: { 200: z.string() }
    },
    handler: async (req, res) => {
      void res.header("Content-Type", "application/pkcs7-mime; smime-type=certs-only");
      void res.header("Content-Transfer-Encoding", "base64");
      return server.services.certificateEstV3.getCaCertsByProfile({
        profileId: req.params.profileId,
        applicationId: req.params.applicationId
      });
    }
  });
};
