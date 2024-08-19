import * as x509 from "@peculiar/x509";
import bcrypt from "bcrypt";
import { Certificate, ContentInfo, EncapsulatedContentInfo, SignedData } from "pkijs";
import { z } from "zod";

import { BadRequestError, UnauthorizedError } from "@app/lib/errors";
import { writeLimit } from "@app/server/config/rateLimiter";

export const registerCertificateEstRouter = async (server: FastifyZodProvider) => {
  // add support for CSR bodies
  server.addContentTypeParser("application/pkcs10", { parseAs: "string" }, (_, body, done) => {
    try {
      done(null, (body as string).replace(/\n/g, "").replace(/ /g, ""));
    } catch (err) {
      const error = err as Error;
      done(error, undefined);
    }
  });

  // Authenticate EST client
  server.addHook("onRequest", async (req, res) => {
    const { authorization } = req.headers;
    if (!authorization) {
      const wwwAuthenticateHeader = "WWW-Authenticate";
      const errAuthRequired = "Authentication required";

      await res.hijack();

      res.raw.setHeader(wwwAuthenticateHeader, `Basic realm="infisical"`);
      res.raw.setHeader("Content-Length", 0);
      res.raw.statusCode = 401;

      // Write the error message to the response without ending the connection
      res.raw.write(errAuthRequired);

      // flush headers
      res.raw.flushHeaders();
      return;
    }

    const urlFragments = req.url.split("/");
    const certificateTemplateId = urlFragments.slice(-2)[0];
    const estConfig = await server.services.certificateTemplate.getEstConfiguration({
      isInternal: true,
      certificateTemplateId
    });

    if (!estConfig.isEnabled) {
      throw new BadRequestError({
        message: "EST enrollment is disabled"
      });
    }

    const sslClientCert = req.headers["x-ssl-client-cert"] as string;
    const leafCertificate = decodeURIComponent(sslClientCert).match(
      /-----BEGIN CERTIFICATE-----[\s\S]+?-----END CERTIFICATE-----/g
    )?.[0];

    if (!sslClientCert || !leafCertificate) {
      throw new UnauthorizedError({ message: "Missing client certificate" });
    }

    const clientCertBody = leafCertificate
      .replace("-----BEGIN CERTIFICATE-----", "")
      .replace("-----END CERTIFICATE-----", "")
      .replace(/\n/g, "")
      .replace(/ /g, "")
      .trim();

    // validate SSL client cert against configured CA
    const chainCerts = estConfig.caChain
      .match(/-----BEGIN CERTIFICATE-----[\s\S]+?-----END CERTIFICATE-----/g)
      ?.map((cert) => {
        const processedBody = cert
          .replace("-----BEGIN CERTIFICATE-----", "")
          .replace("-----END CERTIFICATE-----", "")
          .replace(/\n/g, "")
          .replace(/ /g, "")
          .trim();

        const certificateBuffer = Buffer.from(processedBody, "base64");
        return new x509.X509Certificate(certificateBuffer);
      });

    if (!chainCerts) {
      throw new BadRequestError({ message: "Failed to parse certificate chain" });
    }

    let isSslClientCertValid = true;
    let certToVerify = new x509.X509Certificate(clientCertBody);

    for await (const issuerCert of chainCerts) {
      if (
        await certToVerify.verify({
          publicKey: issuerCert.publicKey,
          date: new Date()
        })
      ) {
        certToVerify = issuerCert; // Move to the next certificate in the chain
      } else {
        isSslClientCertValid = false;
      }
    }

    if (!isSslClientCertValid) {
      throw new UnauthorizedError({
        message: "Invalid client certificate"
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
      body: z.string(),
      params: z.object({
        certificateTemplateId: z.string()
      }),
      response: {
        200: z.object({})
      }
    },
    handler: async (req, res) => {
      const { rawCertificate } = await server.services.certificateAuthority.signCertFromCa({
        isInternal: true,
        certificateTemplateId: req.params.certificateTemplateId,
        csr: req.body,
        altNames: "",
        ttl: "1h"
      });

      void res.header("Content-Type", "application/pkcs7-mime; smime-type=certs-only");
      void res.header("Content-Transfer-Encoding", "base64");

      const cert = Certificate.fromBER(rawCertificate);
      const cmsSigned = new SignedData({
        encapContentInfo: new EncapsulatedContentInfo({
          eContentType: "1.2.840.113549.1.7.1" // not encrypted and not compressed data
        }),
        certificates: [cert]
      });

      const cmsContent = new ContentInfo({
        contentType: "1.2.840.113549.1.7.2", // SignedData
        // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
        content: cmsSigned.toSchema()
      });

      const derBuffer = cmsContent.toSchema().toBER(false);
      const base64Pkcs7 = Buffer.from(derBuffer).toString("base64");

      return base64Pkcs7;
    }
  });
};
