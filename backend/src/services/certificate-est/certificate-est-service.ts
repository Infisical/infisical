import * as x509 from "@peculiar/x509";

import { BadRequestError, NotFoundError, UnauthorizedError } from "@app/lib/errors";

import { checkCertValidityAgainstChain, convertCertPemToRaw } from "../certificate/certificate-fns";
import { TCertificateAuthorityCertDALFactory } from "../certificate-authority/certificate-authority-cert-dal";
import { TCertificateAuthorityDALFactory } from "../certificate-authority/certificate-authority-dal";
import { getCaCertChain, getCaCertChains } from "../certificate-authority/certificate-authority-fns";
import { TCertificateAuthorityServiceFactory } from "../certificate-authority/certificate-authority-service";
import { TCertificateTemplateDALFactory } from "../certificate-template/certificate-template-dal";
import { TCertificateTemplateServiceFactory } from "../certificate-template/certificate-template-service";
import { TKmsServiceFactory } from "../kms/kms-service";
import { TProjectDALFactory } from "../project/project-dal";
import { convertRawCertsToPkcs7 } from "./certificate-est-fns";

type TCertificateEstServiceFactoryDep = {
  certificateAuthorityService: Pick<TCertificateAuthorityServiceFactory, "signCertFromCa">;
  certificateTemplateService: Pick<TCertificateTemplateServiceFactory, "getEstConfiguration">;
  certificateTemplateDAL: Pick<TCertificateTemplateDALFactory, "findById">;
  certificateAuthorityDAL: Pick<TCertificateAuthorityDALFactory, "findById">;
  certificateAuthorityCertDAL: Pick<TCertificateAuthorityCertDALFactory, "find" | "findById">;
  projectDAL: Pick<TProjectDALFactory, "findOne" | "updateById" | "transaction">;
  kmsService: Pick<TKmsServiceFactory, "decryptWithKmsKey" | "generateKmsKey">;
};

export type TCertificateEstServiceFactory = ReturnType<typeof certificateEstServiceFactory>;

export const certificateEstServiceFactory = ({
  certificateAuthorityService,
  certificateTemplateService,
  certificateTemplateDAL,
  certificateAuthorityCertDAL,
  certificateAuthorityDAL,
  projectDAL,
  kmsService
}: TCertificateEstServiceFactoryDep) => {
  const simpleReenroll = async ({
    csr,
    certificateTemplateId,
    sslClientCert
  }: {
    csr: string;
    certificateTemplateId: string;
    sslClientCert: string;
  }) => {
    const estConfig = await certificateTemplateService.getEstConfiguration({
      isInternal: true,
      certificateTemplateId
    });

    if (!estConfig.isEnabled) {
      throw new BadRequestError({
        message: "EST is disabled"
      });
    }

    const certTemplate = await certificateTemplateDAL.findById(certificateTemplateId);

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

    const cert = new x509.X509Certificate(clientCertBody);

    // We have to assert that the client certificate provided can be traced back to the Root CA
    const caCertChains = await getCaCertChains({
      caId: certTemplate.caId,
      certificateAuthorityCertDAL,
      certificateAuthorityDAL,
      projectDAL,
      kmsService
    });

    const parsedChains = caCertChains
      // we need the full chain from the CA certificate to the root
      .map((chain) => chain.certificate + chain.certificateChain)
      .map(
        (certificateChain) =>
          certificateChain.match(/-----BEGIN CERTIFICATE-----[\s\S]+?-----END CERTIFICATE-----/g)?.map((certEntry) => {
            const processedBody = certEntry
              .replace("-----BEGIN CERTIFICATE-----", "")
              .replace("-----END CERTIFICATE-----", "")
              .replace(/\n/g, "")
              .replace(/ /g, "")
              .trim();

            const certificateBuffer = Buffer.from(processedBody, "base64");
            return new x509.X509Certificate(certificateBuffer);
          })
      );

    if (!parsedChains || !parsedChains.length) {
      throw new BadRequestError({
        message: "Error parsing CA chain"
      });
    }

    const certValidityAgainstChains = await Promise.all(
      parsedChains.map(async (chain) => {
        if (!chain) {
          return false;
        }

        return checkCertValidityAgainstChain(cert, chain);
      })
    );

    if (certValidityAgainstChains.every((isCertValid) => !isCertValid)) {
      throw new BadRequestError({
        message: "Invalid client certificate"
      });
    }

    // We ensure that the Subject and SubjectAltNames of the CSR and the existing certificate are exactly the same
    const csrObj = new x509.Pkcs10CertificateRequest(csr);
    if (csrObj.subject !== cert.subject) {
      throw new BadRequestError({
        message: "Subject mismatch"
      });
    }

    let csrSanSet: Set<string> = new Set();
    const csrSanExtension = csrObj.extensions.find((ext) => ext.type === "2.5.29.17");
    if (csrSanExtension) {
      const sanNames = new x509.GeneralNames(csrSanExtension.value);
      csrSanSet = new Set([...sanNames.items.map((name) => `${name.type}-${name.value}`)]);
    }

    let certSanSet: Set<string> = new Set();
    const certSanExtension = cert.extensions.find((ext) => ext.type === "2.5.29.17");
    if (certSanExtension) {
      const sanNames = new x509.GeneralNames(certSanExtension.value);
      certSanSet = new Set([...sanNames.items.map((name) => `${name.type}-${name.value}`)]);
    }

    if (csrSanSet.size !== certSanSet.size || ![...csrSanSet].every((element) => certSanSet.has(element))) {
      throw new BadRequestError({
        message: "Subject alternative names mismatch"
      });
    }

    const { rawCertificate } = await certificateAuthorityService.signCertFromCa({
      isInternal: true,
      certificateTemplateId,
      csr
    });

    return convertRawCertsToPkcs7([rawCertificate]);
  };

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

    const cert = new x509.X509Certificate(clientCertBody);

    if (!(await checkCertValidityAgainstChain(cert, chainCerts))) {
      throw new UnauthorizedError({
        message: "Invalid client certificate"
      });
    }

    const { rawCertificate } = await certificateAuthorityService.signCertFromCa({
      isInternal: true,
      certificateTemplateId,
      csr
    });

    return convertRawCertsToPkcs7([rawCertificate]);
  };

  const getCaCerts = async ({ certificateTemplateId }: { certificateTemplateId: string }) => {
    const certTemplate = await certificateTemplateDAL.findById(certificateTemplateId);
    if (!certTemplate) {
      throw new NotFoundError({
        message: "Certificate template not found"
      });
    }

    const ca = await certificateAuthorityDAL.findById(certTemplate.caId);
    if (!ca) {
      throw new NotFoundError({
        message: "Certificate Authority not found"
      });
    }

    const { caCert, caCertChain } = await getCaCertChain({
      caCertId: ca.activeCaCertId as string,
      certificateAuthorityDAL,
      certificateAuthorityCertDAL,
      projectDAL,
      kmsService
    });

    const caCertRaw = convertCertPemToRaw(caCert);
    const caParentsRaw = caCertChain
      .match(/-----BEGIN CERTIFICATE-----[\s\S]+?-----END CERTIFICATE-----/g)
      ?.map(convertCertPemToRaw);

    return convertRawCertsToPkcs7([caCertRaw, ...(caParentsRaw ?? [])]);
  };

  return {
    simpleEnroll,
    simpleReenroll,
    getCaCerts
  };
};
