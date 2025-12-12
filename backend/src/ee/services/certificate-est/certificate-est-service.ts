import * as x509 from "@peculiar/x509";

import { SubscriptionProductCategory } from "@app/db/schemas";
import { extractX509CertFromChain } from "@app/lib/certificates/extract-certificate";
import { BadRequestError, NotFoundError, UnauthorizedError } from "@app/lib/errors";
import { isCertChainValid } from "@app/services/certificate/certificate-fns";
import { TCertificateAuthorityCertDALFactory } from "@app/services/certificate-authority/certificate-authority-cert-dal";
import { TCertificateAuthorityDALFactory } from "@app/services/certificate-authority/certificate-authority-dal";
import { getCaCertChain, getCaCertChains } from "@app/services/certificate-authority/certificate-authority-fns";
import { TInternalCertificateAuthorityServiceFactory } from "@app/services/certificate-authority/internal/internal-certificate-authority-service";
import { TCertificateTemplateDALFactory } from "@app/services/certificate-template/certificate-template-dal";
import { TCertificateTemplateServiceFactory } from "@app/services/certificate-template/certificate-template-service";
import { TKmsServiceFactory } from "@app/services/kms/kms-service";
import { TProjectDALFactory } from "@app/services/project/project-dal";

import { TLicenseServiceFactory } from "../license/license-service";
import { convertRawCertsToPkcs7 } from "./certificate-est-fns";

type TCertificateEstServiceFactoryDep = {
  internalCertificateAuthorityService: Pick<TInternalCertificateAuthorityServiceFactory, "signCertFromCa">;
  certificateTemplateService: Pick<TCertificateTemplateServiceFactory, "getEstConfiguration">;
  certificateTemplateDAL: Pick<TCertificateTemplateDALFactory, "findById">;
  certificateAuthorityDAL: Pick<TCertificateAuthorityDALFactory, "findById" | "findByIdWithAssociatedCa">;
  certificateAuthorityCertDAL: Pick<TCertificateAuthorityCertDALFactory, "find" | "findById">;
  projectDAL: Pick<TProjectDALFactory, "findOne" | "updateById" | "transaction">;
  kmsService: Pick<TKmsServiceFactory, "decryptWithKmsKey" | "generateKmsKey">;
  licenseService: Pick<TLicenseServiceFactory, "getPlan">;
};

export type TCertificateEstServiceFactory = ReturnType<typeof certificateEstServiceFactory>;

export const certificateEstServiceFactory = ({
  internalCertificateAuthorityService,
  certificateTemplateService,
  certificateTemplateDAL,
  certificateAuthorityCertDAL,
  certificateAuthorityDAL,
  projectDAL,
  kmsService,
  licenseService
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

    const plan = await licenseService.getPlan(estConfig.orgId);
    if (!plan.get(SubscriptionProductCategory.CertManager, "pkiEst")) {
      throw new BadRequestError({
        message:
          "Failed to perform EST operation - simpleReenroll due to plan restriction. Upgrade to the Enterprise plan."
      });
    }

    if (!estConfig.isEnabled) {
      throw new BadRequestError({
        message: "EST is disabled"
      });
    }

    const certTemplate = await certificateTemplateDAL.findById(certificateTemplateId);

    const leafCertificate = extractX509CertFromChain(decodeURIComponent(sslClientCert))?.[0];

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
        const caChain = extractX509CertFromChain(chain.certificateChain)?.map((c) => new x509.X509Certificate(c)) || [];

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

    const { certificate } = await internalCertificateAuthorityService.signCertFromCa({
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

    const plan = await licenseService.getPlan(estConfig.orgId);
    if (!plan.get(SubscriptionProductCategory.CertManager, "pkiEst")) {
      throw new BadRequestError({
        message:
          "Failed to perform EST operation - simpleEnroll due to plan restriction. Upgrade to the Enterprise plan."
      });
    }

    if (!estConfig.isEnabled) {
      throw new BadRequestError({
        message: "EST is disabled"
      });
    }

    if (!estConfig.disableBootstrapCertValidation) {
      const caCerts = extractX509CertFromChain(estConfig.caChain)?.map((cert) => {
        return new x509.X509Certificate(cert);
      });

      if (!caCerts) {
        throw new BadRequestError({ message: "Failed to parse certificate chain" });
      }

      const leafCertificate = extractX509CertFromChain(decodeURIComponent(sslClientCert))?.[0];

      if (!leafCertificate) {
        throw new BadRequestError({ message: "Missing client certificate" });
      }

      const certObj = new x509.X509Certificate(leafCertificate);
      if (!(await isCertChainValid([certObj, ...caCerts]))) {
        throw new BadRequestError({ message: "Invalid certificate chain" });
      }
    }

    const { certificate } = await internalCertificateAuthorityService.signCertFromCa({
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
        message: `Certificate template with ID '${certificateTemplateId}' not found`
      });
    }

    const estConfig = await certificateTemplateService.getEstConfiguration({
      isInternal: true,
      certificateTemplateId
    });

    const plan = await licenseService.getPlan(estConfig.orgId);
    if (!plan.get(SubscriptionProductCategory.CertManager, "pkiEst")) {
      throw new BadRequestError({
        message: "Failed to perform EST operation - caCerts due to plan restriction. Upgrade to the Enterprise plan."
      });
    }

    if (!estConfig.isEnabled) {
      throw new BadRequestError({
        message: "EST is disabled"
      });
    }

    const ca = await certificateAuthorityDAL.findByIdWithAssociatedCa(certTemplate.caId);
    if (!ca?.internalCa?.id) {
      throw new NotFoundError({
        message: `Internal Certificate Authority with ID '${certTemplate.caId}' not found`
      });
    }

    const { caCert, caCertChain } = await getCaCertChain({
      caCertId: ca.internalCa.activeCaCertId as string,
      certificateAuthorityDAL,
      certificateAuthorityCertDAL,
      projectDAL,
      kmsService
    });

    const certificates = extractX509CertFromChain(caCertChain).map((cert) => new x509.X509Certificate(cert));

    const caCertificate = new x509.X509Certificate(caCert);
    return convertRawCertsToPkcs7([caCertificate.rawData, ...certificates.map((cert) => cert.rawData)]);
  };

  return {
    simpleEnroll,
    simpleReenroll,
    getCaCerts
  };
};
