import * as x509 from "@peculiar/x509";
import { Certificate, ContentInfo, EncapsulatedContentInfo, SignedData } from "pkijs";

import { BadRequestError, UnauthorizedError } from "@app/lib/errors";

import { TCertificateAuthorityServiceFactory } from "../certificate-authority/certificate-authority-service";
import { TCertificateTemplateServiceFactory } from "../certificate-template/certificate-template-service";

type TCertificateEstServiceFactoryDep = {
  certificateAuthorityService: Pick<TCertificateAuthorityServiceFactory, "signCertFromCa">;
  certificateTemplateService: Pick<TCertificateTemplateServiceFactory, "getEstConfiguration">;
};

export type TCertificateEstServiceFactory = ReturnType<typeof certificateEstServiceFactory>;

export const certificateEstServiceFactory = ({
  certificateAuthorityService,
  certificateTemplateService
}: TCertificateEstServiceFactoryDep) => {
  const simpleEnroll = async ({
    csr,
    certificateTemplateId,
    sslClientCert
  }: {
    csr: string;
    certificateTemplateId: string;
    sslClientCert: string;
  }) => {
    /* We first have to assert that the client certificate provided can be traced back to the attached
       CA chain in the EST configuration
     */
    const estConfig = await certificateTemplateService.getEstConfiguration({
      isInternal: true,
      certificateTemplateId
    });

    if (!estConfig.isEnabled) {
      throw new BadRequestError({
        message: "EST is disabled"
      });
    }

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

    const { rawCertificate } = await certificateAuthorityService.signCertFromCa({
      isInternal: true,
      certificateTemplateId,
      csr
    });

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
  };
  return {
    simpleEnroll
  };
};
