import * as x509 from "@peculiar/x509";

import { ProjectType, TCertificateTemplateEstConfigsUpdate } from "@app/db/schemas";
import { TKmsCoreDomain } from "@app/domains/platform/kms-core/ce/module";
import { TLicenseDomain } from "@app/domains/platform/license/ce/module";
import {
  ProjectPermissionPkiTemplateActions,
  ProjectPermissionSub,
  TProjectsDomain
} from "@app/domains/platform/projects/ce/module";
import { extractX509CertFromChain } from "@app/lib/certificates/extract-certificate";
import { getConfig } from "@app/lib/config/env";
import { crypto } from "@app/lib/crypto/cryptography";
import { BadRequestError, NotFoundError } from "@app/lib/errors";

import { TCertificateAuthorityDALFactory } from "../certificate-authority/certificate-authority-dal";
import { isCertChainValid } from "../certificate/certificate-fns";
import { TProjectDALFactory } from "../project/project-dal";
import { TCertificateTemplateDALFactory } from "./certificate-template-dal";
import { TCertificateTemplateEstConfigDALFactory } from "./certificate-template-est-config-dal";
import {
  TCreateCertTemplateDTO,
  TCreateEstConfigurationDTO,
  TDeleteCertTemplateDTO,
  TGetCertTemplateDTO,
  TGetEstConfigurationDTO,
  TUpdateCertTemplateDTO,
  TUpdateEstConfigurationDTO
} from "./certificate-template-types";

type TCertificateTemplateServiceFactoryDep = {
  certificateTemplateDAL: TCertificateTemplateDALFactory;
  certificateTemplateEstConfigDAL: TCertificateTemplateEstConfigDALFactory;
  projectDAL: Pick<TProjectDALFactory, "findProjectBySlug" | "findOne" | "updateById" | "findById" | "transaction">;
  kmsCoreDomain: TKmsCoreDomain;
  certificateAuthorityDAL: Pick<TCertificateAuthorityDALFactory, "findById">;
  projectsDomain: Pick<TProjectsDomain, "getProjectPermission">;
  licenseDomain: TLicenseDomain;
};

export type TCertificateTemplateServiceFactory = ReturnType<typeof certificateTemplateServiceFactory>;

export const certificateTemplateServiceFactory = ({
  certificateTemplateDAL,
  certificateTemplateEstConfigDAL,
  certificateAuthorityDAL,
  projectsDomain,
  kmsCoreDomain,
  licenseDomain
}: TCertificateTemplateServiceFactoryDep) => {
  const createCertTemplate = async ({
    caId,
    pkiCollectionId,
    name,
    commonName,
    subjectAlternativeName,
    ttl,
    actor,
    keyUsages,
    extendedKeyUsages
  }: TCreateCertTemplateDTO) => {
    const ca = await certificateAuthorityDAL.findById(caId);
    if (!ca) {
      throw new NotFoundError({
        message: `CA with ID ${caId} not found`
      });
    }
    const permission = await projectsDomain.getProjectPermission({
      actor,
      projectId: ca.projectId,
      type: ProjectType.CertificateManager
    });

    permission.assert({
      action: ProjectPermissionPkiTemplateActions.Create,
      subject: ProjectPermissionSub.CertificateTemplates,
      fields: { name }
    });

    return certificateTemplateDAL.transaction(async (tx) => {
      const { id } = await certificateTemplateDAL.create(
        {
          caId,
          pkiCollectionId,
          name,
          commonName,
          subjectAlternativeName,
          ttl,
          keyUsages,
          extendedKeyUsages
        },
        tx
      );

      const certificateTemplate = await certificateTemplateDAL.getById(id, tx);
      if (!certificateTemplate) {
        throw new NotFoundError({
          message: `Certificate template with ID ${id} not found`
        });
      }

      return certificateTemplate;
    });
  };

  const updateCertTemplate = async ({
    id,
    caId,
    pkiCollectionId,
    name,
    commonName,
    subjectAlternativeName,
    ttl,
    actor,
    keyUsages,
    extendedKeyUsages
  }: TUpdateCertTemplateDTO) => {
    const certTemplate = await certificateTemplateDAL.getById(id);
    if (!certTemplate) {
      throw new NotFoundError({
        message: `Certificate template with ID ${id} not found`
      });
    }

    const permission = await projectsDomain.getProjectPermission({
      actor,
      projectId: certTemplate.projectId,
      type: ProjectType.CertificateManager
    });

    permission.assert({
      action: ProjectPermissionPkiTemplateActions.Edit,
      subject: ProjectPermissionSub.CertificateTemplates,
      fields: { name: certTemplate.name }
    });

    if (caId) {
      const ca = await certificateAuthorityDAL.findById(caId);
      if (!ca || ca.projectId !== certTemplate.projectId) {
        throw new BadRequestError({
          message: "Invalid CA"
        });
      }
    }

    if (name) {
      permission.assert({
        action: ProjectPermissionPkiTemplateActions.Create,
        subject: ProjectPermissionSub.CertificateTemplates,
        fields: { name }
      });
    }

    return certificateTemplateDAL.transaction(async (tx) => {
      await certificateTemplateDAL.updateById(
        certTemplate.id,
        {
          caId,
          pkiCollectionId,
          commonName,
          subjectAlternativeName,
          name,
          ttl,
          keyUsages,
          extendedKeyUsages
        },
        tx
      );

      const updatedTemplate = await certificateTemplateDAL.getById(id, tx);
      if (!updatedTemplate) {
        throw new NotFoundError({
          message: `Certificate template with ID ${id} not found`
        });
      }

      return updatedTemplate;
    });
  };

  const deleteCertTemplate = async ({ id, actor }: TDeleteCertTemplateDTO) => {
    const certTemplate = await certificateTemplateDAL.getById(id);
    if (!certTemplate) {
      throw new NotFoundError({
        message: `Certificate template with ID ${id} not found`
      });
    }

    const permission = await projectsDomain.getProjectPermission({
      actor,
      projectId: certTemplate.projectId,
      type: ProjectType.CertificateManager
    });

    permission.assert({
      action: ProjectPermissionPkiTemplateActions.Delete,
      subject: ProjectPermissionSub.CertificateTemplates,
      fields: { name: certTemplate.name }
    });

    await certificateTemplateDAL.deleteById(certTemplate.id);

    return certTemplate;
  };

  const getCertTemplate = async ({ id, actor }: TGetCertTemplateDTO) => {
    const certTemplate = await certificateTemplateDAL.getById(id);
    if (!certTemplate) {
      throw new NotFoundError({
        message: `Certificate template with ID ${id} not found`
      });
    }

    const permission = await projectsDomain.getProjectPermission({
      actor,
      projectId: certTemplate.projectId,
      type: ProjectType.CertificateManager
    });

    permission.assert({
      action: ProjectPermissionPkiTemplateActions.Read,
      subject: ProjectPermissionSub.CertificateTemplates,
      fields: { name: certTemplate.name }
    });

    return certTemplate;
  };

  const createEstConfiguration = async ({
    certificateTemplateId,
    caChain,
    passphrase,
    isEnabled,
    actor,
    disableBootstrapCertValidation
  }: TCreateEstConfigurationDTO) => {
    const plan = await licenseDomain.getPlan(actor.org.id);
    if (!plan.pkiEst) {
      throw new BadRequestError({
        message: "Failed to create EST configuration due to plan restriction. Upgrade to the Enterprise plan."
      });
    }

    const certTemplate = await certificateTemplateDAL.getById(certificateTemplateId);
    if (!certTemplate) {
      throw new NotFoundError({
        message: `Certificate template with ID ${certificateTemplateId} not found`
      });
    }

    const permission = await projectsDomain.getProjectPermission({
      actor,
      projectId: certTemplate.projectId,
      type: ProjectType.CertificateManager
    });

    permission.assert({
      action: ProjectPermissionPkiTemplateActions.Edit,
      subject: ProjectPermissionSub.CertificateTemplates,
      fields: { name: certTemplate.name }
    });

    const appCfg = getConfig();

    let encryptedCaChain: Buffer | undefined;
    if (caChain) {
      const certificateManagerKmsId = await kmsCoreDomain.getProjectCertificateKmsKeyId(certTemplate.projectId);

      // validate CA chain
      const certificates = extractX509CertFromChain(caChain)?.map((cert) => new x509.X509Certificate(cert));

      if (!certificates) {
        throw new BadRequestError({ message: "Failed to parse certificate chain" });
      }

      if (!(await isCertChainValid(certificates))) {
        throw new BadRequestError({ message: "Invalid certificate chain" });
      }

      const kmsEncryptor = await kmsCoreDomain.encryptWithKmsKey({
        kmsId: certificateManagerKmsId
      });

      const { cipherTextBlob } = await kmsEncryptor({
        plainText: Buffer.from(caChain)
      });

      encryptedCaChain = cipherTextBlob;
    }

    const hashedPassphrase = await crypto.hashing().createHash(passphrase, appCfg.SALT_ROUNDS);
    const estConfig = await certificateTemplateEstConfigDAL.create({
      certificateTemplateId,
      hashedPassphrase,
      encryptedCaChain,
      isEnabled,
      disableBootstrapCertValidation
    });

    return { ...estConfig, projectId: certTemplate.projectId };
  };

  const updateEstConfiguration = async ({
    certificateTemplateId,
    caChain,
    passphrase,
    isEnabled,
    actor,
    disableBootstrapCertValidation
  }: TUpdateEstConfigurationDTO) => {
    const plan = await licenseDomain.getPlan(actor.org.id);
    if (!plan.pkiEst) {
      throw new BadRequestError({
        message: "Failed to update EST configuration due to plan restriction. Upgrade to the Enterprise plan."
      });
    }

    const certTemplate = await certificateTemplateDAL.getById(certificateTemplateId);
    if (!certTemplate) {
      throw new NotFoundError({
        message: `Certificate template with ID ${certificateTemplateId} not found`
      });
    }

    const permission = await projectsDomain.getProjectPermission({
      actor,
      projectId: certTemplate.projectId,
      type: ProjectType.CertificateManager
    });

    permission.assert({
      action: ProjectPermissionPkiTemplateActions.Edit,
      subject: ProjectPermissionSub.CertificateTemplates,
      fields: { name: certTemplate.name }
    });

    const originalCaEstConfig = await certificateTemplateEstConfigDAL.findOne({
      certificateTemplateId
    });

    if (!originalCaEstConfig) {
      throw new NotFoundError({
        message: `EST configuration with certificate template ID ${certificateTemplateId} not found`
      });
    }

    const appCfg = getConfig();

    const certificateManagerKmsId = await kmsCoreDomain.getProjectCertificateKmsKeyId(certTemplate.projectId);

    const updatedData: TCertificateTemplateEstConfigsUpdate = {
      isEnabled,
      disableBootstrapCertValidation
    };

    if (caChain) {
      const certificates = extractX509CertFromChain(caChain)?.map((cert) => new x509.X509Certificate(cert));

      if (!certificates) {
        throw new BadRequestError({ message: "Failed to parse certificate chain" });
      }

      if (!(await isCertChainValid(certificates))) {
        throw new BadRequestError({ message: "Invalid certificate chain" });
      }

      const kmsEncryptor = await kmsCoreDomain.encryptWithKmsKey({
        kmsId: certificateManagerKmsId
      });

      const { cipherTextBlob: encryptedCaChain } = await kmsEncryptor({
        plainText: Buffer.from(caChain)
      });

      updatedData.encryptedCaChain = encryptedCaChain;
    }

    if (passphrase) {
      const hashedPassphrase = await crypto.hashing().createHash(passphrase, appCfg.SALT_ROUNDS);
      updatedData.hashedPassphrase = hashedPassphrase;
    }

    const estConfig = await certificateTemplateEstConfigDAL.updateById(originalCaEstConfig.id, updatedData);

    return { ...estConfig, projectId: certTemplate.projectId };
  };

  const getEstConfiguration = async (dto: TGetEstConfigurationDTO) => {
    const { certificateTemplateId, isInternal } = dto;

    const certTemplate = await certificateTemplateDAL.getById(certificateTemplateId);
    if (!certTemplate) {
      throw new NotFoundError({
        message: `Certificate template with ID ${certificateTemplateId} not found`
      });
    }

    if (!isInternal) {
      const permission = await projectsDomain.getProjectPermission({
        actor: dto.actor,
        projectId: certTemplate.projectId,
        type: ProjectType.CertificateManager
      });

      permission.assert({
        action: ProjectPermissionPkiTemplateActions.Read,
        subject: ProjectPermissionSub.CertificateTemplates,
        fields: { name: certTemplate.name }
      });
    }

    const estConfig = await certificateTemplateEstConfigDAL.findOne({
      certificateTemplateId
    });

    if (!estConfig) {
      throw new NotFoundError({
        message: `EST configuration with certificate template ID ${certificateTemplateId} not found`
      });
    }

    const certificateManagerKmsId = await kmsCoreDomain.getProjectCertificateKmsKeyId(certTemplate.projectId);

    const kmsDecryptor = await kmsCoreDomain.decryptWithKmsKey({
      kmsId: certificateManagerKmsId
    });

    let decryptedCaChain = "";
    if (estConfig.encryptedCaChain) {
      decryptedCaChain = (
        await kmsDecryptor({
          cipherTextBlob: estConfig.encryptedCaChain
        })
      ).toString();
    }

    return {
      certificateTemplateId,
      id: estConfig.id,
      isEnabled: estConfig.isEnabled,
      caChain: decryptedCaChain,
      hashedPassphrase: estConfig.hashedPassphrase,
      projectId: certTemplate.projectId,
      orgId: certTemplate.orgId,
      disableBootstrapCertValidation: estConfig.disableBootstrapCertValidation
    };
  };

  return {
    createCertTemplate,
    getCertTemplate,
    deleteCertTemplate,
    updateCertTemplate,
    createEstConfiguration,
    updateEstConfiguration,
    getEstConfiguration
  };
};
