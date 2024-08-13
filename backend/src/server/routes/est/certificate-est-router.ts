import * as x509 from "@peculiar/x509";
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
    const certificateAuthorityId = urlFragments.slice(-2)[0];

    const hardcodedCertificateChain = `
    -----BEGIN CERTIFICATE-----
    MIIEYzCCA0ugAwIBAgIUbxMrGIZnxNcX2kuYpGOFqix9P80wDQYJKoZIhvcNAQEL
    BQAwaTELMAkGA1UEBhMCUEgxDTALBgNVBAgMBENlYnUxDTALBgNVBAcMBENlYnUx
    EjAQBgNVBAoMCUluZmlzaWNhbDEUMBIGA1UECwwLRW5naW5lZXJpbmcxEjAQBgNV
    BAMMCWxvY2FsaG9zdDAeFw0yNDA4MTIxMzM4MTNaFw0yNTA4MTIxMzM4MTNaMGkx
    CzAJBgNVBAYTAlBIMQ0wCwYDVQQIDARDZWJ1MQ0wCwYDVQQHDARDZWJ1MRIwEAYD
    VQQKDAlJbmZpc2ljYWwxFDASBgNVBAsMC0VuZ2luZWVyaW5nMRIwEAYDVQQDDAls
    b2NhbGhvc3QwggEiMA0GCSqGSIb3DQEBAQUAA4IBDwAwggEKAoIBAQDqssBBMfzr
    1DDRIxl8TcCHmQU+qhmw8ACkoNN0b+vD0USVv4SC1ABKtYQBBDvBOtQulqc4yTRw
    A3Q0y3XUR+pyCFb5PcTG8ZFUZ7ewrrHrdExd0enY/R3eDPAb6H7hokDS10Sr5BRR
    Oow109yzX7ipbw+kYSOOLTF1gX+ewbfpcGNylJNOvFNcu4V64Qg5NXp2Lo4o/VTj
    IY9yxgVjep8utC/klughk3/EUqfyZ8/9BHyYj3KWDj7VpZNU4o506ZkYsCOPESe1
    SMl8z4s4bEkfTd6+9SetKkwmCbRpZE5iS0XV0lrySK7AGwKHPuJ5RYj0WZp5O/SK
    1zC0azN787T3AgMBAAGjggEBMIH+MB0GA1UdDgQWBBT25nGrtg4VmDaXscjwEv/B
    CSFd2jCBpgYDVR0jBIGeMIGbgBT25nGrtg4VmDaXscjwEv/BCSFd2qFtpGswaTEL
    MAkGA1UEBhMCUEgxDTALBgNVBAgMBENlYnUxDTALBgNVBAcMBENlYnUxEjAQBgNV
    BAoMCUluZmlzaWNhbDEUMBIGA1UECwwLRW5naW5lZXJpbmcxEjAQBgNVBAMMCWxv
    Y2FsaG9zdIIUbxMrGIZnxNcX2kuYpGOFqix9P80wDwYDVR0TAQH/BAUwAwEB/zAO
    BgNVHQ8BAf8EBAMCBaAwEwYDVR0lBAwwCgYIKwYBBQUHAwIwDQYJKoZIhvcNAQEL
    BQADggEBABPV6jpVHvnvp6cAPewL6SSN20KGdNX3MCpLIxPhz8dbGnc2SWMaR0Eo
    GqAYvUgG0xpEWCTZ7RDtfrU7vt6+PnFpP2z0a4YToF24/tdAOMAUQ2AedULAb8UP
    gwHDeZKKYhs7kscApO0VgYJgjqFe2Kjlt0zzVcMj0qrwgdDUFTNWGOdQy1ghmStc
    nBw2xVppG0QAyIWnvxqPva+czHhMd8bmLR44VCuzO5xS5B/AUk7BeNBLuEEfM3DR
    quZ0PRwgsaY/WND3ux93FaSiqfn5y9uZdJkqfJcPL6SKRms6v6da4Rh/DyFcWQFW
    iwIeUl1cXagVKziyr4Ch5U5dnp+y8Es=
    -----END CERTIFICATE-----
    `;

    const sslClientCert = req.headers["x-ssl-client-cert"] as string;
    if (!sslClientCert) {
      throw new UnauthorizedError({ message: "Missing client certificate" });
    }
    const clientCertBody = decodeURIComponent(sslClientCert)
      .replace("-----BEGIN CERTIFICATE-----", "")
      .replace("-----END CERTIFICATE-----", "")
      .replace(/\n/g, "")
      .replace(/ /g, "")
      .trim();

    // validate SSL client cert against configured CA
    const chainCerts = hardcodedCertificateChain
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

    const basicCredential = atob(rawCredential);
    // compare with EST configuration here
  });

  server.route({
    method: "POST",
    url: "/:certificateAuthorityId/simpleenroll",
    config: {
      rateLimit: writeLimit
    },
    schema: {
      body: z.string(),
      params: z.object({
        certificateAuthorityId: z.string()
      }),
      response: {
        200: z.object({})
      }
    },
    handler: async (req, res) => {
      const { rawCertificate } = await server.services.certificateAuthority.signCertFromCa({
        isInternal: true,
        caId: req.params.certificateAuthorityId,
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
