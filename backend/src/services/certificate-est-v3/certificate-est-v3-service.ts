import * as x509 from "@peculiar/x509";

import { extractX509CertFromChain } from "@app/lib/certificates/extract-certificate";
import { BadRequestError, NotFoundError, UnauthorizedError } from "@app/lib/errors";
import { isCertChainValid } from "@app/services/certificate/certificate-fns";
import { TCertificateAuthorityCertDALFactory } from "@app/services/certificate-authority/certificate-authority-cert-dal";
import { TCertificateAuthorityDALFactory } from "@app/services/certificate-authority/certificate-authority-dal";
import { getCaCertChain, getCaCertChains } from "@app/services/certificate-authority/certificate-authority-fns";
import { TInternalCertificateAuthorityServiceFactory } from "@app/services/certificate-authority/internal/internal-certificate-authority-service";
import { extractCertificateRequestFromCSR } from "@app/services/certificate-common/certificate-csr-utils";
import { mapEnumsForValidation } from "@app/services/certificate-common/certificate-utils";
import { TCertificateProfileDALFactory } from "@app/services/certificate-profile/certificate-profile-dal";
import { EnrollmentType } from "@app/services/certificate-profile/certificate-profile-types";
import { TCertificateTemplateV2ServiceFactory } from "@app/services/certificate-template-v2/certificate-template-v2-service";
import { TEstEnrollmentConfigDALFactory } from "@app/services/enrollment-config/est-enrollment-config-dal";
import { TKmsServiceFactory } from "@app/services/kms/kms-service";
import { TProjectDALFactory } from "@app/services/project/project-dal";
import { getProjectKmsCertificateKeyId } from "@app/services/project/project-fns";

import { convertRawCertsToPkcs7 } from "../../ee/services/certificate-est/certificate-est-fns";
import { TLicenseServiceFactory } from "../../ee/services/license/license-service";

type TCertificateEstV3ServiceFactoryDep = {
  internalCertificateAuthorityService: Pick<TInternalCertificateAuthorityServiceFactory, "signCertFromCa">;
  certificateTemplateV2Service: Pick<TCertificateTemplateV2ServiceFactory, "validateCertificateRequest">;
  certificateAuthorityDAL: Pick<TCertificateAuthorityDALFactory, "findById" | "findByIdWithAssociatedCa">;
  certificateAuthorityCertDAL: Pick<TCertificateAuthorityCertDALFactory, "find" | "findById">;
  projectDAL: Pick<TProjectDALFactory, "findOne" | "updateById" | "transaction">;
  kmsService: Pick<TKmsServiceFactory, "decryptWithKmsKey" | "generateKmsKey">;
  licenseService: Pick<TLicenseServiceFactory, "getPlan">;
  certificateProfileDAL: Pick<TCertificateProfileDALFactory, "findByIdWithConfigs">;
  estEnrollmentConfigDAL: Pick<TEstEnrollmentConfigDALFactory, "findById">;
};

export type TCertificateEstV3ServiceFactory = ReturnType<typeof certificateEstV3ServiceFactory>;

export const certificateEstV3ServiceFactory = ({
  internalCertificateAuthorityService,
  certificateTemplateV2Service,
  certificateAuthorityCertDAL,
  certificateAuthorityDAL,
  projectDAL,
  kmsService,
  licenseService,
  certificateProfileDAL,
  estEnrollmentConfigDAL
}: TCertificateEstV3ServiceFactoryDep) => {
  const simpleEnrollByProfile = async ({
    csr,
    profileId,
    sslClientCert
  }: {
    csr: string;
    profileId: string;
    sslClientCert: string;
  }) => {
    const profile = await certificateProfileDAL.findByIdWithConfigs(profileId);
    if (!profile) {
      throw new NotFoundError({ message: "Certificate profile not found" });
    }

    if (profile.enrollmentType !== EnrollmentType.EST) {
      throw new BadRequestError({ message: "Profile is not configured for EST enrollment" });
    }

    if (!profile.estConfigId) {
      throw new BadRequestError({ message: "EST enrollment not configured for this profile" });
    }

    if (!profile.caId) {
      throw new BadRequestError({
        message: "Self-signed certificates are not supported for EST enrollment"
      });
    }

    const estConfig = await estEnrollmentConfigDAL.findById(profile.estConfigId);
    if (!estConfig) {
      throw new NotFoundError({ message: "EST configuration not found" });
    }

    const project = await projectDAL.findOne({ id: profile.projectId });
    if (!project) {
      throw new NotFoundError({ message: "Project not found" });
    }

    const plan = await licenseService.getPlan(project.orgId);
    if (!plan.pkiEst) {
      throw new BadRequestError({
        message:
          "Failed to perform EST operation - simpleEnroll due to plan restriction. Upgrade to the Enterprise plan."
      });
    }

    if (!estConfig.disableBootstrapCaValidation) {
      const certificateManagerKmsId = await getProjectKmsCertificateKeyId({
        projectId: profile.projectId,
        projectDAL,
        kmsService
      });

      const kmsDecryptor = await kmsService.decryptWithKmsKey({
        kmsId: certificateManagerKmsId
      });

      const decryptedCaChain = estConfig.encryptedCaChain
        ? (
            await kmsDecryptor({
              cipherTextBlob: estConfig.encryptedCaChain
            })
          ).toString()
        : "";

      const caCerts = extractX509CertFromChain(decryptedCaChain)?.map((cert) => {
        return new x509.X509Certificate(cert);
      });

      if (!caCerts) {
        throw new BadRequestError({ message: "Failed to parse certificate chain" });
      }

      const leafCertificate = extractX509CertFromChain(decodeURIComponent(sslClientCert))?.[0];

      if (!leafCertificate) {
        throw new UnauthorizedError({ message: "Missing client certificate" });
      }

      const certObj = new x509.X509Certificate(leafCertificate);
      if (!(await isCertChainValid([certObj, ...caCerts]))) {
        throw new BadRequestError({ message: "Invalid certificate chain" });
      }
    }

    const certificateRequest = extractCertificateRequestFromCSR(csr);
    const mappedCertificateRequest = mapEnumsForValidation(certificateRequest);
    const validationResult = await certificateTemplateV2Service.validateCertificateRequest(
      profile.certificateTemplateId,
      mappedCertificateRequest
    );

    if (!validationResult.isValid) {
      throw new BadRequestError({
        message: `Certificate request validation failed: ${validationResult.errors.join(", ")}`
      });
    }

    const { certificate } = await internalCertificateAuthorityService.signCertFromCa({
      isInternal: true,
      caId: profile.caId,
      csr,
      isFromProfile: true
    });

    return convertRawCertsToPkcs7([certificate.rawData]);
  };

  const simpleReenrollByProfile = async ({
    csr,
    profileId,
    sslClientCert
  }: {
    csr: string;
    profileId: string;
    sslClientCert: string;
  }) => {
    const profile = await certificateProfileDAL.findByIdWithConfigs(profileId);
    if (!profile) {
      throw new NotFoundError({ message: "Certificate profile not found" });
    }

    if (profile.enrollmentType !== EnrollmentType.EST) {
      throw new BadRequestError({ message: "Profile is not configured for EST enrollment" });
    }

    if (!profile.estConfigId) {
      throw new BadRequestError({ message: "EST enrollment not configured for this profile" });
    }

    if (!profile.caId) {
      throw new BadRequestError({
        message: "Self-signed certificates are not supported for EST enrollment"
      });
    }

    const estConfig = await estEnrollmentConfigDAL.findById(profile.estConfigId);
    if (!estConfig) {
      throw new NotFoundError({ message: "EST configuration not found" });
    }

    const project = await projectDAL.findOne({ id: profile.projectId });
    if (!project) {
      throw new NotFoundError({ message: "Project not found" });
    }

    const plan = await licenseService.getPlan(project.orgId);
    if (!plan.pkiEst) {
      throw new BadRequestError({
        message:
          "Failed to perform EST operation - simpleReenroll due to plan restriction. Upgrade to the Enterprise plan."
      });
    }

    const leafCertificate = extractX509CertFromChain(decodeURIComponent(sslClientCert))?.[0];

    if (!leafCertificate) {
      throw new UnauthorizedError({ message: "Missing client certificate" });
    }

    const cert = new x509.X509Certificate(leafCertificate);
    const caCertChains = await getCaCertChains({
      caId: profile.caId,
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

    const certificateRequest = extractCertificateRequestFromCSR(csr);
    const mappedCertificateRequest = mapEnumsForValidation(certificateRequest);
    const validationResult = await certificateTemplateV2Service.validateCertificateRequest(
      profile.certificateTemplateId,
      mappedCertificateRequest
    );

    if (!validationResult.isValid) {
      throw new BadRequestError({
        message: `Certificate request validation failed: ${validationResult.errors.join(", ")}`
      });
    }

    const { certificate } = await internalCertificateAuthorityService.signCertFromCa({
      isInternal: true,
      caId: profile.caId,
      csr,
      isFromProfile: true
    });

    return convertRawCertsToPkcs7([certificate.rawData]);
  };

  const getCaCertsByProfile = async ({ profileId }: { profileId: string }) => {
    const profile = await certificateProfileDAL.findByIdWithConfigs(profileId);
    if (!profile) {
      throw new NotFoundError({ message: "Certificate profile not found" });
    }

    if (profile.enrollmentType !== EnrollmentType.EST) {
      throw new BadRequestError({ message: "Profile is not configured for EST enrollment" });
    }

    if (!profile.estConfigId) {
      throw new BadRequestError({ message: "EST enrollment not configured for this profile" });
    }

    if (!profile.caId) {
      throw new BadRequestError({
        message: "Self-signed certificates are not supported for EST enrollment"
      });
    }

    const estConfig = await estEnrollmentConfigDAL.findById(profile.estConfigId);
    if (!estConfig) {
      throw new NotFoundError({ message: "EST configuration not found" });
    }

    const project = await projectDAL.findOne({ id: profile.projectId });
    if (!project) {
      throw new NotFoundError({ message: "Project not found" });
    }

    const plan = await licenseService.getPlan(project.orgId);
    if (!plan.pkiEst) {
      throw new BadRequestError({
        message: "Failed to perform EST operation - caCerts due to plan restriction. Upgrade to the Enterprise plan."
      });
    }

    const ca = await certificateAuthorityDAL.findByIdWithAssociatedCa(profile.caId);
    if (!ca?.internalCa?.id) {
      throw new NotFoundError({
        message: `Internal Certificate Authority with ID '${profile.caId}' not found`
      });
    }

    const { caCert, caCertChain } = await getCaCertChain({
      caCertId: ca.internalCa.activeCaCertId as string,
      certificateAuthorityDAL,
      certificateAuthorityCertDAL,
      projectDAL,
      kmsService
    });

    let certificates: x509.X509Certificate[] = [];
    if (caCertChain && caCertChain.trim()) {
      try {
        certificates = extractX509CertFromChain(caCertChain).map((cert) => new x509.X509Certificate(cert));
      } catch (error) {
        certificates = [];
      }
    }

    const caCertificate = new x509.X509Certificate(caCert);

    return convertRawCertsToPkcs7([caCertificate.rawData, ...certificates.map((cert) => cert.rawData)]);
  };

  return {
    simpleEnrollByProfile,
    simpleReenrollByProfile,
    getCaCertsByProfile
  };
};
