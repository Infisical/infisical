import { ForbiddenError, subject } from "@casl/ability";
import * as x509 from "@peculiar/x509";

import { TCertificateTemplateEstConfigsUpdate } from "@app/db/schemas/certificate-template-est-configs";
import { ActionProjectType } from "@app/db/schemas/models";
import { TLicenseServiceFactory } from "@app/ee/services/license/license-service";
import { TPermissionServiceFactory } from "@app/ee/services/permission/permission-service-types";
import {
  ProjectPermissionPkiTemplateActions,
  ProjectPermissionSub
} from "@app/ee/services/permission/project-permission";
import { extractX509CertFromChain } from "@app/lib/certificates/extract-certificate";
import { getConfig } from "@app/lib/config/env";
import { crypto } from "@app/lib/crypto/cryptography";
import { BadRequestError, NotFoundError } from "@app/lib/errors";

import { isCertChainValid } from "../certificate/certificate-fns";
import { TCertificateAuthorityDALFactory } from "../certificate-authority/certificate-authority-dal";
import { TKmsServiceFactory } from "../kms/kms-service";
import { TProjectDALFactory } from "../project/project-dal";
import { getProjectKmsCertificateKeyId } from "../project/project-fns";
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
  kmsService: Pick<TKmsServiceFactory, "generateKmsKey" | "encryptWithKmsKey" | "decryptWithKmsKey">;
  certificateAuthorityDAL: Pick<TCertificateAuthorityDALFactory, "findById">;
  permissionService: Pick<TPermissionServiceFactory, "getProjectPermission">;
  licenseService: Pick<TLicenseServiceFactory, "getPlan">;
};

export type TCertificateTemplateServiceFactory = ReturnType<typeof certificateTemplateServiceFactory>;

export const certificateTemplateServiceFactory = ({
  certificateTemplateDAL,
  certificateTemplateEstConfigDAL,
  certificateAuthorityDAL,
  permissionService,
  kmsService,
  projectDAL,
  licenseService
}: TCertificateTemplateServiceFactoryDep) => {
  const createCertTemplate = async ({
    caId,
    pkiCollectionId,
    name,
    commonName,
    subjectAlternativeName,
    ttl,
    actorId,
    actorAuthMethod,
    actor,
    actorOrgId,
    keyUsages,
    extendedKeyUsages
  }: TCreateCertTemplateDTO) => {
    const ca = await certificateAuthorityDAL.findById(caId);
    if (!ca) {
      throw new NotFoundError({
        message: `CA with ID ${caId} not found`
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
    actorId,
    actorAuthMethod,
    actor,
    actorOrgId,
    keyUsages,
    extendedKeyUsages
  }: TUpdateCertTemplateDTO) => {
    const certTemplate = await certificateTemplateDAL.getById(id);
    if (!certTemplate) {
      throw new NotFoundError({
        message: `Certificate template with ID ${id} not found`
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
      subject(ProjectPermissionSub.CertificateTemplates, { name: certTemplate.name })
    );

    if (caId) {
      const ca = await certificateAuthorityDAL.findById(caId);
      if (!ca || ca.projectId !== certTemplate.projectId) {
        throw new BadRequestError({
          message: "Invalid CA"
        });
      }
    }

    if (name) {
      ForbiddenError.from(permission).throwUnlessCan(
        ProjectPermissionPkiTemplateActions.Create,
        subject(ProjectPermissionSub.CertificateTemplates, { name })
      );
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

  const deleteCertTemplate = async ({ id, actorId, actorAuthMethod, actor, actorOrgId }: TDeleteCertTemplateDTO) => {
    const certTemplate = await certificateTemplateDAL.getById(id);
    if (!certTemplate) {
      throw new NotFoundError({
        message: `Certificate template with ID ${id} not found`
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
      subject(ProjectPermissionSub.CertificateTemplates, { name: certTemplate.name })
    );

    await certificateTemplateDAL.deleteById(certTemplate.id);

    return certTemplate;
  };

  const getCertTemplate = async ({ id, actorId, actorAuthMethod, actor, actorOrgId }: TGetCertTemplateDTO) => {
    const certTemplate = await certificateTemplateDAL.getById(id);
    if (!certTemplate) {
      throw new NotFoundError({
        message: `Certificate template with ID ${id} not found`
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
      subject(ProjectPermissionSub.CertificateTemplates, { name: certTemplate.name })
    );

    return certTemplate;
  };

  const createEstConfiguration = async ({
    certificateTemplateId,
    caChain,
    passphrase,
    isEnabled,
    actorId,
    actorAuthMethod,
    actor,
    actorOrgId,
    disableBootstrapCertValidation
  }: TCreateEstConfigurationDTO) => {
    const plan = await licenseService.getPlan(actorOrgId);
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
      subject(ProjectPermissionSub.CertificateTemplates, { name: certTemplate.name })
    );

    const appCfg = getConfig();

    let encryptedCaChain: Buffer | undefined;
    if (caChain) {
      const certificateManagerKmsId = await getProjectKmsCertificateKeyId({
        projectId: certTemplate.projectId,
        projectDAL,
        kmsService
      });

      // validate CA chain
      const certificates = extractX509CertFromChain(caChain)?.map((cert) => new x509.X509Certificate(cert));

      if (!certificates) {
        throw new BadRequestError({ message: "Failed to parse certificate chain" });
      }

      if (!(await isCertChainValid(certificates))) {
        throw new BadRequestError({ message: "Invalid certificate chain" });
      }

      const kmsEncryptor = await kmsService.encryptWithKmsKey({
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
    actorId,
    actorAuthMethod,
    actor,
    actorOrgId,
    disableBootstrapCertValidation
  }: TUpdateEstConfigurationDTO) => {
    const plan = await licenseService.getPlan(actorOrgId);
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
      subject(ProjectPermissionSub.CertificateTemplates, { name: certTemplate.name })
    );

    const originalCaEstConfig = await certificateTemplateEstConfigDAL.findOne({
      certificateTemplateId
    });

    if (!originalCaEstConfig) {
      throw new NotFoundError({
        message: `EST configuration with certificate template ID ${certificateTemplateId} not found`
      });
    }

    const appCfg = getConfig();

    const certificateManagerKmsId = await getProjectKmsCertificateKeyId({
      projectId: certTemplate.projectId,
      projectDAL,
      kmsService
    });

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

      const kmsEncryptor = await kmsService.encryptWithKmsKey({
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
      const { permission } = await permissionService.getProjectPermission({
        actor: dto.actor,
        actorId: dto.actorId,
        projectId: certTemplate.projectId,
        actorAuthMethod: dto.actorAuthMethod,
        actorOrgId: dto.actorOrgId,
        actionProjectType: ActionProjectType.CertificateManager
      });

      ForbiddenError.from(permission).throwUnlessCan(
        ProjectPermissionPkiTemplateActions.Read,
        subject(ProjectPermissionSub.CertificateTemplates, { name: certTemplate.name })
      );
    }

    const estConfig = await certificateTemplateEstConfigDAL.findOne({
      certificateTemplateId
    });

    if (!estConfig) {
      throw new NotFoundError({
        message: `EST configuration with certificate template ID ${certificateTemplateId} not found`
      });
    }

    const certificateManagerKmsId = await getProjectKmsCertificateKeyId({
      projectId: certTemplate.projectId,
      projectDAL,
      kmsService
    });

    const kmsDecryptor = await kmsService.decryptWithKmsKey({
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
