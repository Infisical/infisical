import bcrypt from "bcrypt";
import { z } from "zod";

import { getConfig } from "@app/lib/config/env";
import { BadRequestError, UnauthorizedError } from "@app/lib/errors";
import { readLimit, writeLimit } from "@app/server/config/rateLimiter";

export const registerCertificateEstRouter = async (server: FastifyZodProvider) => {
  const appCfg = getConfig();

  // add support for CSR bodies
  server.addContentTypeParser("application/pkcs10", { parseAs: "string" }, (_, body, done) => {
    try {
      let csrBody = body as string;
      // some EST clients send CSRs in PEM format and some in base64 format
      // for CSRs sent in PEM, we leave them as is
      // for CSRs sent in base64, we preprocess them to remove new lines and spaces
      if (!csrBody.includes("BEGIN CERTIFICATE REQUEST")) {
        csrBody = csrBody.replace(/\n/g, "").replace(/ /g, "");
      }

      done(null, csrBody);
    } catch (err) {
      const error = err as Error;
      done(error, undefined);
    }
  });

  // Authenticate EST client using Passphrase
  server.addHook("onRequest", async (req, res) => {
    const { authorization } = req.headers;
    const urlFragments = req.url.split("/");

    // cacerts endpoint should not have any authentication
    if (urlFragments[urlFragments.length - 1] === "cacerts") {
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

    const certificateTemplateId = urlFragments.slice(-2)[0];
    const estConfig = await server.services.certificateTemplate.getEstConfiguration({
      isInternal: true,
      certificateTemplateId
    });

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

    const isPasswordValid = await bcrypt.compare(password, estConfig.hashedPassphrase);
    if (!isPasswordValid) {
      throw new UnauthorizedError({
        message: "Invalid credentials"
      });
    }
  });

  server.route({
    method: "POST",
    url: "/:certificateTemplateId/simpleenroll",
    config: {
      rateLimit: writeLimit
    },
    schema: {
      body: z.string().min(1),
      params: z.object({
        certificateTemplateId: z.string().min(1)
      }),
      response: {
        200: z.string()
      }
    },
    handler: async (req, res) => {
      void res.header("Content-Type", "application/pkcs7-mime; smime-type=certs-only");
      void res.header("Content-Transfer-Encoding", "base64");

      return server.services.certificateEst.simpleEnroll({
        csr: req.body,
        certificateTemplateId: req.params.certificateTemplateId,
        sslClientCert: req.headers[appCfg.SSL_CLIENT_CERTIFICATE_HEADER_KEY] as string
      });
    }
  });

  server.route({
    method: "POST",
    url: "/:certificateTemplateId/simplereenroll",
    config: {
      rateLimit: writeLimit
    },
    schema: {
      body: z.string().min(1),
      params: z.object({
        certificateTemplateId: z.string().min(1)
      }),
      response: {
        200: z.string()
      }
    },
    handler: async (req, res) => {
      void res.header("Content-Type", "application/pkcs7-mime; smime-type=certs-only");
      void res.header("Content-Transfer-Encoding", "base64");

      return server.services.certificateEst.simpleReenroll({
        csr: req.body,
        certificateTemplateId: req.params.certificateTemplateId,
        sslClientCert: req.headers[appCfg.SSL_CLIENT_CERTIFICATE_HEADER_KEY] as string
      });
    }
  });

  server.route({
    method: "GET",
    url: "/:certificateTemplateId/cacerts",
    config: {
      rateLimit: readLimit
    },
    schema: {
      params: z.object({
        certificateTemplateId: z.string().min(1)
      }),
      response: {
        200: z.string()
      }
    },
    handler: async (req, res) => {
      void res.header("Content-Type", "application/pkcs7-mime; smime-type=certs-only");
      void res.header("Content-Transfer-Encoding", "base64");

      return server.services.certificateEst.getCaCerts({
        certificateTemplateId: req.params.certificateTemplateId
      });
    }
  });
};
