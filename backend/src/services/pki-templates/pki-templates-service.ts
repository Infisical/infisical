/* eslint-disable no-bitwise */
import { ForbiddenError, subject } from "@casl/ability";
import * as x509 from "@peculiar/x509";
import RE2 from "re2";

import { ActionProjectType } from "@app/db/schemas";
import { TCertificateAuthorityCrlDALFactory } from "@app/ee/services/certificate-authority-crl/certificate-authority-crl-dal";
import { TPermissionServiceFactory } from "@app/ee/services/permission/permission-service-types";
import {
  ProjectPermissionPkiTemplateActions,
  ProjectPermissionSub
} from "@app/ee/services/permission/project-permission";
import { getConfig } from "@app/lib/config/env";
import { BadRequestError, NotFoundError } from "@app/lib/errors";
import { ms } from "@app/lib/ms";

import { TCertificateBodyDALFactory } from "../certificate/certificate-body-dal";
import { TCertificateDALFactory } from "../certificate/certificate-dal";
import { TCertificateSecretDALFactory } from "../certificate/certificate-secret-dal";
import {
  CertExtendedKeyUsage,
  CertExtendedKeyUsageOIDToName,
  CertKeyAlgorithm,
  CertKeyUsage,
  CertStatus
} from "../certificate/certificate-types";
import { TCertificateAuthorityCertDALFactory } from "../certificate-authority/certificate-authority-cert-dal";
import { TCertificateAuthorityDALFactory } from "../certificate-authority/certificate-authority-dal";
import { CaStatus } from "../certificate-authority/certificate-authority-enums";
import {
  createSerialNumber,
  expandInternalCa,
  getCaCertChain,
  getCaCredentials,
  keyAlgorithmToAlgCfg,
  parseDistinguishedName
} from "../certificate-authority/certificate-authority-fns";
import { TCertificateAuthoritySecretDALFactory } from "../certificate-authority/certificate-authority-secret-dal";
import { InternalCertificateAuthorityFns } from "../certificate-authority/internal/internal-certificate-authority-fns";
import { TKmsServiceFactory } from "../kms/kms-service";
import { TProjectDALFactory } from "../project/project-dal";
import { getProjectKmsCertificateKeyId } from "../project/project-fns";
import { TPkiTemplatesDALFactory } from "./pki-templates-dal";
import {
  TCreatePkiTemplateDTO,
  TDeletePkiTemplateDTO,
  TGetPkiTemplateDTO,
  TIssueCertPkiTemplateDTO,
  TListPkiTemplateDTO,
  TSignCertPkiTemplateDTO,
  TUpdatePkiTemplateDTO
} from "./pki-templates-types";

type TPkiTemplatesServiceFactoryDep = {
  pkiTemplatesDAL: TPkiTemplatesDALFactory;
  permissionService: Pick<TPermissionServiceFactory, "getProjectPermission">;
  certificateAuthorityDAL: Pick<
    TCertificateAuthorityDALFactory,
    | "findByIdWithAssociatedCa"
    | "findById"
    | "transaction"
    | "create"
    | "updateById"
    | "findWithAssociatedCa"
    | "findOne"
  >;
  internalCaFns: ReturnType<typeof InternalCertificateAuthorityFns>;
  kmsService: Pick<TKmsServiceFactory, "generateKmsKey" | "decryptWithKmsKey" | "encryptWithKmsKey">;
  certificateAuthorityCertDAL: Pick<TCertificateAuthorityCertDALFactory, "findById">;
  certificateAuthoritySecretDAL: Pick<TCertificateAuthoritySecretDALFactory, "findOne">;
  certificateAuthorityCrlDAL: Pick<TCertificateAuthorityCrlDALFactory, "findOne">;
  certificateDAL: Pick<
    TCertificateDALFactory,
    "create" | "transaction" | "countCertificatesForPkiSubscriber" | "findLatestActiveCertForSubscriber" | "find"
  >;
  certificateSecretDAL: Pick<TCertificateSecretDALFactory, "create" | "findOne">;
  certificateBodyDAL: Pick<TCertificateBodyDALFactory, "create" | "findOne">;
  projectDAL: Pick<TProjectDALFactory, "findOne" | "updateById" | "transaction" | "findById" | "find">;
};

export type TPkiTemplatesServiceFactory = ReturnType<typeof pkiTemplatesServiceFactory>;

export const pkiTemplatesServiceFactory = ({
  pkiTemplatesDAL,
  permissionService,
  internalCaFns,
  certificateAuthorityDAL,
  certificateAuthorityCertDAL,
  certificateAuthoritySecretDAL,
  certificateAuthorityCrlDAL,
  certificateDAL,
  certificateBodyDAL,
  kmsService,
  projectDAL
}: TPkiTemplatesServiceFactoryDep) => {
  const createTemplate = async ({
    actor,
    actorId,
    actorAuthMethod,
    actorOrgId,
    caName,
    commonName,
    extendedKeyUsages,
    keyUsages,
    name,
    subjectAlternativeName,
    ttl,
    projectId
  }: TCreatePkiTemplateDTO) => {
    const ca = await certificateAuthorityDAL.findOne({ name: caName, projectId });
    if (!ca) {
      throw new NotFoundError({
        message: `CA with name ${caName} not found`
      });
    }

    const { permission } = await permissionService.getProjectPermission({
      actor,
      actorId,
      projectId: ca.projectId,
      actorAuthMethod,
      actorOrgId,
      actionProjectType: ActionProjectType.CertificateManager
    });

    ForbiddenError.from(permission).throwUnlessCan(
      ProjectPermissionPkiTemplateActions.Create,
      subject(ProjectPermissionSub.CertificateTemplates, { name })
    );

    const existingTemplate = await pkiTemplatesDAL.findOne({ name, projectId: ca.projectId });
    if (existingTemplate) {
      throw new BadRequestError({ message: `Template with name ${name} already exists.` });
    }

    const newTemplate = await pkiTemplatesDAL.create({
      caId: ca.id,
      name,
      commonName,
      subjectAlternativeName,
      ttl,
      keyUsages,
      extendedKeyUsages
    });
    return newTemplate;
  };

  const updateTemplate = async ({
    templateName,
    actor,
    actorId,
    actorAuthMethod,
    actorOrgId,
    caName,
    commonName,
    extendedKeyUsages,
    keyUsages,
    name,
    subjectAlternativeName,
    ttl,
    projectId
  }: TUpdatePkiTemplateDTO) => {
    const certTemplate = await pkiTemplatesDAL.findOne({ name: templateName, projectId });
    if (!certTemplate) {
      throw new NotFoundError({
        message: `Certificate template with name ${templateName} not found`
      });
    }

    const { permission } = await permissionService.getProjectPermission({
      actor,
      actorId,
      projectId: certTemplate.projectId,
      actorAuthMethod,
      actorOrgId,
      actionProjectType: ActionProjectType.CertificateManager
    });

    ForbiddenError.from(permission).throwUnlessCan(
      ProjectPermissionPkiTemplateActions.Edit,
      subject(ProjectPermissionSub.CertificateTemplates, { name: templateName })
    );

    let caId;
    if (caName) {
      const ca = await certificateAuthorityDAL.findOne({ name: caName, projectId });
      if (!ca || ca.projectId !== certTemplate.projectId) {
        throw new NotFoundError({
          message: `CA with name ${caName} not found`
        });
      }
      caId = ca.id;
    }

    if (name) {
      ForbiddenError.from(permission).throwUnlessCan(
        ProjectPermissionPkiTemplateActions.Edit,
        subject(ProjectPermissionSub.CertificateTemplates, { name })
      );

      const existingTemplate = await pkiTemplatesDAL.findOne({ name, projectId });
      if (existingTemplate && existingTemplate.id !== certTemplate.id) {
        throw new BadRequestError({ message: `Template with name ${name} already exists.` });
      }
    }

    const updatedTemplate = await pkiTemplatesDAL.updateById(certTemplate.id, {
      caId,
      name,
      commonName,
      subjectAlternativeName,
      ttl,
      keyUsages,
      extendedKeyUsages
    });
    return updatedTemplate;
  };

  const deleteTemplate = async ({
    templateName,
    actor,
    actorId,
    actorAuthMethod,
    actorOrgId,
    projectId
  }: TDeletePkiTemplateDTO) => {
    const certTemplate = await pkiTemplatesDAL.findOne({ name: templateName, projectId });
    if (!certTemplate) {
      throw new NotFoundError({
        message: `Certificate template with name ${templateName} not found`
      });
    }

    const { permission } = await permissionService.getProjectPermission({
      actor,
      actorId,
      projectId: certTemplate.projectId,
      actorAuthMethod,
      actorOrgId,
      actionProjectType: ActionProjectType.CertificateManager
    });

    ForbiddenError.from(permission).throwUnlessCan(
      ProjectPermissionPkiTemplateActions.Delete,
      subject(ProjectPermissionSub.CertificateTemplates, { name: templateName })
    );

    const deletedTemplate = await pkiTemplatesDAL.deleteById(certTemplate.id);
    return deletedTemplate;
  };

  const getTemplateByName = async ({
    templateName,
    actor,
    actorId,
    actorAuthMethod,
    actorOrgId,
    projectId
  }: TGetPkiTemplateDTO) => {
    const certTemplate = await pkiTemplatesDAL.findOne({ name: templateName, projectId });
    if (!certTemplate) {
      throw new NotFoundError({
        message: `Certificate template with name ${templateName} not found`
      });
    }

    const { permission } = await permissionService.getProjectPermission({
      actor,
      actorId,
      projectId: certTemplate.projectId,
      actorAuthMethod,
      actorOrgId,
      actionProjectType: ActionProjectType.CertificateManager
    });

    ForbiddenError.from(permission).throwUnlessCan(
      ProjectPermissionPkiTemplateActions.Read,
      subject(ProjectPermissionSub.CertificateTemplates, { name: templateName })
    );

    return certTemplate;
  };

  const listTemplate = async ({
    actor,
    actorId,
    actorAuthMethod,
    actorOrgId,
    projectId,
    limit,
    offset
  }: TListPkiTemplateDTO) => {
    const { permission } = await permissionService.getProjectPermission({
      actor,
      actorId,
      projectId,
      actorAuthMethod,
      actorOrgId,
      actionProjectType: ActionProjectType.CertificateManager
    });

    const certTemplate = await pkiTemplatesDAL.find({ projectId }, { limit, offset, count: true });
    return {
      certificateTemplates: certTemplate.filter((el) =>
        permission.can(
          ProjectPermissionPkiTemplateActions.Read,
          subject(ProjectPermissionSub.CertificateTemplates, { name: el.name })
        )
      ),
      totalCount: Number(certTemplate?.[0]?.count ?? 0)
    };
  };

  const issueCertificate = async ({
    templateName,
    projectId,
    commonName,
    altNames,
    ttl,
    notBefore,
    notAfter,
    actorId,
    actorAuthMethod,
    actor,
    actorOrgId,
    keyUsages,
    extendedKeyUsages
  }: TIssueCertPkiTemplateDTO) => {
    const certTemplate = await pkiTemplatesDAL.findOne({ name: templateName, projectId });
    if (!certTemplate) {
      throw new NotFoundError({
        message: `Certificate template with name ${templateName} not found`
      });
    }

    const { permission } = await permissionService.getProjectPermission({
      actor,
      actorId,
      projectId: certTemplate.projectId,
      actorAuthMethod,
      actorOrgId,
      actionProjectType: ActionProjectType.CertificateManager
    });

    ForbiddenError.from(permission).throwUnlessCan(
      ProjectPermissionPkiTemplateActions.IssueCert,
      subject(ProjectPermissionSub.CertificateTemplates, { name: templateName })
    );

    const ca = await certificateAuthorityDAL.findByIdWithAssociatedCa(certTemplate.caId);
    if (ca.internalCa?.id) {
      return internalCaFns.issueCertificateWithTemplate(ca, certTemplate, {
        altNames,
        commonName,
        ttl,
        extendedKeyUsages,
        keyUsages,
        notAfter,
        notBefore
      });
    }

    throw new BadRequestError({ message: "CA does not support immediate issuance of certificates" });
  };

  const signCertificate = async ({
    templateName,
    csr,
    projectId,
    actorId,
    actorAuthMethod,
    actor,
    actorOrgId,
    ttl
  }: TSignCertPkiTemplateDTO) => {
    const certTemplate = await pkiTemplatesDAL.findOne({ name: templateName, projectId });
    if (!certTemplate) {
      throw new NotFoundError({
        message: `Certificate template with name ${templateName} not found`
      });
    }

    const { permission } = await permissionService.getProjectPermission({
      actor,
      actorId,
      projectId: certTemplate.projectId,
      actorAuthMethod,
      actorOrgId,
      actionProjectType: ActionProjectType.CertificateManager
    });

    ForbiddenError.from(permission).throwUnlessCan(
      ProjectPermissionPkiTemplateActions.IssueCert,
      subject(ProjectPermissionSub.CertificateTemplates, { name: templateName })
    );

    const appCfg = getConfig();

    const ca = await certificateAuthorityDAL.findByIdWithAssociatedCa(certTemplate.caId);
    if (!ca?.internalCa) throw new NotFoundError({ message: `CA with ID '${certTemplate.caId}' not found` });

    if (ca.status !== CaStatus.ACTIVE) throw new BadRequestError({ message: "CA is not active" });
    if (!ca.internalCa?.activeCaCertId)
      throw new BadRequestError({ message: "CA does not have a certificate installed" });

    const caCert = await certificateAuthorityCertDAL.findById(ca.internalCa.activeCaCertId);

    const certificateManagerKmsId = await getProjectKmsCertificateKeyId({
      projectId: ca.projectId,
      projectDAL,
      kmsService
    });
    const kmsDecryptor = await kmsService.decryptWithKmsKey({
      kmsId: certificateManagerKmsId
    });

    const decryptedCaCert = await kmsDecryptor({
      cipherTextBlob: caCert.encryptedCertificate
    });

    const caCertObj = new x509.X509Certificate(decryptedCaCert);
    const notBeforeDate = new Date();
    const notAfterDate = new Date(new Date().getTime() + ms(ttl ?? "0"));
    const caCertNotBeforeDate = new Date(caCertObj.notBefore);
    const caCertNotAfterDate = new Date(caCertObj.notAfter);

    // check not before constraint
    if (notBeforeDate < caCertNotBeforeDate) {
      throw new BadRequestError({ message: "notBefore date is before CA certificate's notBefore date" });
    }

    // check not after constraint
    if (notAfterDate > caCertNotAfterDate) {
      throw new BadRequestError({ message: "notAfter date is after CA certificate's notAfter date" });
    }

    const alg = keyAlgorithmToAlgCfg(ca.internalCa.keyAlgorithm as CertKeyAlgorithm);

    const csrObj = new x509.Pkcs10CertificateRequest(csr);
    const dn = parseDistinguishedName(csrObj.subject);
    const cn = dn.commonName;
    if (!cn)
      throw new BadRequestError({
        message: "Missing common name on CSR"
      });

    const commonNameRegex = new RE2(certTemplate.commonName);
    if (!commonNameRegex.test(cn)) {
      throw new BadRequestError({
        message: "Invalid common name based on template policy"
      });
    }

    if (ms(ttl) > ms(certTemplate.ttl)) {
      throw new BadRequestError({
        message: "Invalid validity date based on template policy"
      });
    }

    const { caPrivateKey, caSecret } = await getCaCredentials({
      caId: ca.id,
      certificateAuthorityDAL,
      certificateAuthoritySecretDAL,
      projectDAL,
      kmsService
    });

    const caCrl = await certificateAuthorityCrlDAL.findOne({ caSecretId: caSecret.id });
    const distributionPointUrl = `${appCfg.SITE_URL}/api/v1/cert-manager/crl/${caCrl.id}/der`;
    const caIssuerUrl = `${appCfg.SITE_URL}/api/v1/cert-manager/ca/internal/${ca.id}/certificates/${caCert.id}/der`;

    const extensions: x509.Extension[] = [
      new x509.BasicConstraintsExtension(false),
      await x509.AuthorityKeyIdentifierExtension.create(caCertObj, false),
      await x509.SubjectKeyIdentifierExtension.create(csrObj.publicKey),
      new x509.CRLDistributionPointsExtension([distributionPointUrl]),
      new x509.AuthorityInfoAccessExtension({
        caIssuers: new x509.GeneralName("url", caIssuerUrl)
      }),
      new x509.CertificatePolicyExtension(["2.5.29.32.0"]) // anyPolicy
    ];

    // handle key usages
    const csrKeyUsageExtension = csrObj.getExtension("2.5.29.15") as x509.KeyUsagesExtension | undefined; // Better to type as optional
    let selectedKeyUsages: CertKeyUsage[] = [];
    if (csrKeyUsageExtension && csrKeyUsageExtension.usages) {
      selectedKeyUsages = Object.values(CertKeyUsage).filter(
        (keyUsage) => (x509.KeyUsageFlags[keyUsage] & csrKeyUsageExtension.usages) !== 0
      );
      const validKeyUsages = certTemplate.keyUsages || [];
      if (selectedKeyUsages.some((keyUsage) => !validKeyUsages.includes(keyUsage))) {
        throw new BadRequestError({
          message: "Invalid key usage value based on template policy"
        });
      }

      const keyUsagesBitValue = selectedKeyUsages.reduce((accum, keyUsage) => accum | x509.KeyUsageFlags[keyUsage], 0);
      if (keyUsagesBitValue) {
        extensions.push(new x509.KeyUsagesExtension(keyUsagesBitValue, true));
      }
    }

    // handle extended key usage
    const csrExtendedKeyUsageExtension = csrObj.getExtension("2.5.29.37") as x509.ExtendedKeyUsageExtension | undefined;
    let selectedExtendedKeyUsages: CertExtendedKeyUsage[] = [];
    if (csrExtendedKeyUsageExtension && csrExtendedKeyUsageExtension.usages.length > 0) {
      selectedExtendedKeyUsages = csrExtendedKeyUsageExtension.usages.map(
        (ekuOid) => CertExtendedKeyUsageOIDToName[ekuOid as string]
      );

      if (selectedExtendedKeyUsages.some((eku) => !certTemplate?.extendedKeyUsages?.includes(eku))) {
        throw new BadRequestError({
          message: "Invalid extended key usage value based on subscriber's specified extended key usages"
        });
      }

      if (selectedExtendedKeyUsages.length) {
        extensions.push(
          new x509.ExtendedKeyUsageExtension(
            selectedExtendedKeyUsages.map((eku) => x509.ExtendedKeyUsage[eku]),
            true
          )
        );
      }
    }

    // attempt to read from CSR if altNames is not explicitly provided
    let altNamesArray: {
      type: "email" | "dns";
      value: string;
    }[] = [];

    const sanExtension = csrObj.extensions.find((ext) => ext.type === "2.5.29.17");
    if (sanExtension) {
      const sanNames = new x509.GeneralNames(sanExtension.value);

      altNamesArray = sanNames.items
        .filter((value) => value.type === "email" || value.type === "dns")
        .map((name) => ({
          type: name.type as "email" | "dns",
          value: name.value
        }));
    }

    if (altNamesArray.length) {
      const altNamesExtension = new x509.SubjectAlternativeNameExtension(altNamesArray, false);
      extensions.push(altNamesExtension);
    }

    const subjectAlternativeNameRegex = new RE2(certTemplate.subjectAlternativeName);
    altNamesArray.forEach((altName) => {
      if (!subjectAlternativeNameRegex.test(altName.value)) {
        throw new BadRequestError({
          message: "Invalid subject alternative name based on template policy"
        });
      }
    });

    const serialNumber = createSerialNumber();
    const leafCert = await x509.X509CertificateGenerator.create({
      serialNumber,
      subject: csrObj.subject,
      issuer: caCertObj.subject,
      notBefore: notBeforeDate,
      notAfter: notAfterDate,
      signingKey: caPrivateKey,
      publicKey: csrObj.publicKey,
      signingAlgorithm: alg,
      extensions
    });

    const kmsEncryptor = await kmsService.encryptWithKmsKey({
      kmsId: certificateManagerKmsId
    });
    const { cipherTextBlob: encryptedCertificate } = await kmsEncryptor({
      plainText: Buffer.from(new Uint8Array(leafCert.rawData))
    });

    const { caCert: issuingCaCertificate, caCertChain } = await getCaCertChain({
      caCertId: ca.internalCa.activeCaCertId,
      certificateAuthorityDAL,
      certificateAuthorityCertDAL,
      projectDAL,
      kmsService
    });

    const certificateChainPem = `${issuingCaCertificate}\n${caCertChain}`.trim();

    const { cipherTextBlob: encryptedCertificateChain } = await kmsEncryptor({
      plainText: Buffer.from(certificateChainPem)
    });

    await certificateDAL.transaction(async (tx) => {
      const cert = await certificateDAL.create(
        {
          caId: ca.id,
          caCertId: caCert.id,
          status: CertStatus.ACTIVE,
          friendlyName: cn,
          commonName: cn,
          altNames: altNamesArray.map((el) => el.value).join(","),
          serialNumber,
          notBefore: notBeforeDate,
          notAfter: notAfterDate,
          keyUsages: selectedKeyUsages,
          extendedKeyUsages: selectedExtendedKeyUsages,
          projectId
        },
        tx
      );

      await certificateBodyDAL.create(
        {
          certId: cert.id,
          encryptedCertificate,
          encryptedCertificateChain
        },
        tx
      );

      return cert;
    });

    return {
      certificate: leafCert.toString("pem"),
      certificateChain: `${issuingCaCertificate}\n${caCertChain}`.trim(),
      issuingCaCertificate,
      serialNumber,
      ca: expandInternalCa(ca),
      commonName: cn,
      template: certTemplate
    };
  };

  return {
    createTemplate,
    updateTemplate,
    getTemplateByName,
    listTemplate,
    deleteTemplate,
    signCertificate,
    issueCertificate
  };
};
