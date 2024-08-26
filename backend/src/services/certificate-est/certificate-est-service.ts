import * as x509 from "@peculiar/x509";

import { BadRequestError, NotFoundError, UnauthorizedError } from "@app/lib/errors";

import { isCertChainValid } from "../certificate/certificate-fns";
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

    if (!leafCertificate) {
      throw new UnauthorizedError({ message: "Missing client certificate" });
    }

    const cert = new x509.X509Certificate(leafCertificate);
    // We have to assert that the client certificate provided can be traced back to the Root CA
    const caCertChains = await getCaCertChains({
      caId: certTemplate.caId,
      certificateAuthorityCertDAL,
      certificateAuthorityDAL,
      projectDAL,
      kmsService
    });

    const verifiedChains = await Promise.all(
      caCertChains.map((chain) => {
        const caCert = new x509.X509Certificate(chain.certificate);
        const caChain =
          chain.certificateChain
            .match(/-----BEGIN CERTIFICATE-----[\s\S]+?-----END CERTIFICATE-----/g)
            ?.map((c) => new x509.X509Certificate(c)) || [];

        return isCertChainValid([cert, caCert, ...caChain]);
      })
    );

    if (!verifiedChains.some(Boolean)) {
      throw new BadRequestError({
        message: "Invalid client certificate: unable to build a valid certificate chain"
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

    const { certificate } = await certificateAuthorityService.signCertFromCa({
      isInternal: true,
      certificateTemplateId,
      csr
    });

    return convertRawCertsToPkcs7([certificate.rawData]);
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

    const caCerts = estConfig.caChain
      .match(/-----BEGIN CERTIFICATE-----[\s\S]+?-----END CERTIFICATE-----/g)
      ?.map((cert) => {
        return new x509.X509Certificate(cert);
      });

    if (!caCerts) {
      throw new BadRequestError({ message: "Failed to parse certificate chain" });
    }

    const leafCertificate = decodeURIComponent(sslClientCert).match(
      /-----BEGIN CERTIFICATE-----[\s\S]+?-----END CERTIFICATE-----/g
    )?.[0];

    if (!leafCertificate) {
      throw new BadRequestError({ message: "Missing client certificate" });
    }

    const certObj = new x509.X509Certificate(leafCertificate);
    if (!(await isCertChainValid([certObj, ...caCerts]))) {
      throw new BadRequestError({ message: "Invalid certificate chain" });
    }

    const { certificate } = await certificateAuthorityService.signCertFromCa({
      isInternal: true,
      certificateTemplateId,
      csr
    });

    return convertRawCertsToPkcs7([certificate.rawData]);
  };

  /**
   * Return the CA certificate and CA certificate chain for the CA bound to
   * the certificate template with id [certificateTemplateId] as part of EST protocol
   */
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

    const certificates = caCertChain
      .match(/-----BEGIN CERTIFICATE-----[\s\S]+?-----END CERTIFICATE-----/g)
      ?.map((cert) => new x509.X509Certificate(cert));

    if (!certificates) {
      throw new BadRequestError({ message: "Failed to parse certificate chain" });
    }

    const caCertificate = new x509.X509Certificate(caCert);
    return convertRawCertsToPkcs7([caCertificate.rawData, ...certificates.map((cert) => cert.rawData)]);
  };

  return {
    simpleEnroll,
    simpleReenroll,
    getCaCerts
  };
};
