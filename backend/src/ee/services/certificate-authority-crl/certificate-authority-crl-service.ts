import { ForbiddenError, subject } from "@casl/ability";
import * as x509 from "@peculiar/x509";

import { ActionProjectType } from "@app/db/schemas";
import { TCertificateAuthorityCrlDALFactory } from "@app/ee/services/certificate-authority-crl/certificate-authority-crl-dal";
import { TLicenseServiceFactory } from "@app/ee/services/license/license-service";
import { TPermissionServiceFactory } from "@app/ee/services/permission/permission-service-types";
import {
  ProjectPermissionCertificateAuthorityActions,
  ProjectPermissionSub
} from "@app/ee/services/permission/project-permission";
import { TKeyStoreFactory } from "@app/keystore/keystore";
import { BadRequestError, NotFoundError } from "@app/lib/errors";
import type { TCaKeySourceServiceFactory } from "@app/services/certificate-authority/ca-key-source/ca-key-source-service";
import { TCertificateAuthorityCertDALFactory } from "@app/services/certificate-authority/certificate-authority-cert-dal";
import { TCertificateAuthorityDALFactory } from "@app/services/certificate-authority/certificate-authority-dal";
import {
  expandInternalCa,
  getInternalCaExpiredAt,
  isCaCrlAllowed,
  rebuildCaCrl
} from "@app/services/certificate-authority/certificate-authority-fns";
import { TCertificateAuthoritySecretDALFactory } from "@app/services/certificate-authority/certificate-authority-secret-dal";
import { TCertificateDALFactory } from "@app/services/certificate/certificate-dal";
import { TKmsServiceFactory } from "@app/services/kms/kms-service";
import { TProjectDALFactory } from "@app/services/project/project-dal";
import { getProjectKmsCertificateKeyId } from "@app/services/project/project-fns";

import { TCertificateAuthorityCrlServiceFactory } from "./certificate-authority-crl-types";

type TCertificateAuthorityCrlServiceFactoryDep = {
  certificateAuthorityDAL: Pick<TCertificateAuthorityDALFactory, "findByIdWithAssociatedCa">;
  certificateAuthorityCrlDAL: Pick<
    TCertificateAuthorityCrlDALFactory,
    "find" | "findById" | "findOne" | "update" | "primaryNode"
  >;
  certificateAuthorityCertDAL: Pick<TCertificateAuthorityCertDALFactory, "findById">;
  certificateAuthoritySecretDAL: Pick<TCertificateAuthoritySecretDALFactory, "findOne">;
  certificateDAL: Pick<TCertificateDALFactory, "find" | "primaryNode">;
  projectDAL: Pick<TProjectDALFactory, "findOne" | "findById" | "updateById" | "transaction">;
  kmsService: Pick<TKmsServiceFactory, "decryptWithKmsKey" | "encryptWithKmsKey" | "generateKmsKey">;
  permissionService: Pick<TPermissionServiceFactory, "getProjectPermission">;
  licenseService: Pick<TLicenseServiceFactory, "getPlan">;
  caKeySourceService: Pick<TCaKeySourceServiceFactory, "buildSigner">;
  keyStore: Pick<TKeyStoreFactory, "acquireLock">;
};

export const certificateAuthorityCrlServiceFactory = ({
  certificateAuthorityDAL,
  certificateAuthorityCrlDAL,
  certificateAuthorityCertDAL,
  certificateAuthoritySecretDAL,
  certificateDAL,
  projectDAL,
  kmsService,
  permissionService,
  licenseService,
  caKeySourceService,
  keyStore
}: TCertificateAuthorityCrlServiceFactoryDep): TCertificateAuthorityCrlServiceFactory => {
  /**
   * Return CRL with id [crlId]
   */
  const getCrlById: TCertificateAuthorityCrlServiceFactory["getCrlById"] = async (crlId) => {
    const caCrl = await certificateAuthorityCrlDAL.findById(crlId);
    if (!caCrl) throw new NotFoundError({ message: `CRL with ID '${crlId}' not found` });

    const ca = await certificateAuthorityDAL.findByIdWithAssociatedCa(caCrl.caId);
    if (!ca?.internalCa?.id) throw new NotFoundError({ message: `Internal CA with ID '${caCrl.caId}' not found` });

    const keyId = await getProjectKmsCertificateKeyId({
      projectId: ca.projectId,
      projectDAL,
      kmsService
    });

    const kmsDecryptor = await kmsService.decryptWithKmsKey({
      kmsId: keyId
    });

    const decryptedCrl = await kmsDecryptor({ cipherTextBlob: caCrl.encryptedCrl });

    const crl = new x509.X509Crl(decryptedCrl);

    return {
      ca: expandInternalCa(ca),
      caCrl,
      crl: crl.rawData
    };
  };

  /**
   * Returns a list of CRL ids for CA with id [caId]
   */
  const getCaCrls: TCertificateAuthorityCrlServiceFactory["getCaCrls"] = async ({
    caId,
    actorId,
    actorAuthMethod,
    actor,
    actorOrgId
  }) => {
    const ca = await certificateAuthorityDAL.findByIdWithAssociatedCa(caId);
    if (!ca?.internalCa?.id) throw new NotFoundError({ message: `Internal CA with ID '${caId}' not found` });

    const { permission } = await permissionService.getProjectPermission({
      actor,
      actorId,
      projectId: ca.projectId,
      actorAuthMethod,
      actorOrgId,
      actionProjectType: ActionProjectType.CertificateManager
    });

    ForbiddenError.from(permission).throwUnlessCan(
      ProjectPermissionCertificateAuthorityActions.Read,
      ProjectPermissionSub.CertificateAuthorities
    );

    const caCrls = await certificateAuthorityCrlDAL.find({ caId: ca.id }, { sort: [["createdAt", "desc"]] });

    const keyId = await getProjectKmsCertificateKeyId({
      projectId: ca.projectId,
      projectDAL,
      kmsService
    });

    const kmsDecryptor = await kmsService.decryptWithKmsKey({
      kmsId: keyId
    });

    const decryptedCrls = await Promise.all(
      caCrls.map(async (caCrl) => {
        const decryptedCrl = await kmsDecryptor({ cipherTextBlob: caCrl.encryptedCrl });
        const crl = new x509.X509Crl(decryptedCrl);

        const base64crl = crl.toString("base64");
        const crlPem = `-----BEGIN X509 CRL-----\n${base64crl.match(/.{1,64}/g)?.join("\n")}\n-----END X509 CRL-----`;
        return {
          id: caCrl.id,
          crl: crlPem,
          thisUpdate: caCrl.thisUpdate,
          nextUpdate: caCrl.nextUpdate,
          crlNumber: Number(caCrl.crlNumber)
        };
      })
    );

    return {
      ca: expandInternalCa(ca),
      crls: decryptedCrls
    };
  };

  const rebuildCrl: TCertificateAuthorityCrlServiceFactory["rebuildCrl"] = async ({
    caId,
    actorId,
    actorAuthMethod,
    actor,
    actorOrgId
  }) => {
    const ca = await certificateAuthorityDAL.findByIdWithAssociatedCa(caId);
    const project = ca?.internalCa?.id ? await projectDAL.findById(ca.projectId) : undefined;
    if (!ca?.internalCa?.id || !project || project.orgId !== actorOrgId) {
      throw new NotFoundError({ message: `CA with ID '${caId}' not found` });
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
      ProjectPermissionCertificateAuthorityActions.Edit,
      subject(ProjectPermissionSub.CertificateAuthorities, { name: ca.name })
    );

    if (!(await isCaCrlAllowed({ orgId: project.orgId, licenseService }))) {
      throw new BadRequestError({
        message: "Failed to regenerate the CRL due to plan restriction. Upgrade plan to regenerate CRLs on demand."
      });
    }

    if (!ca.internalCa.activeCaCertId) {
      throw new BadRequestError({
        message: `CA '${ca.name}' has no certificate yet. Generate or install its CA certificate before regenerating the CRL.`
      });
    }

    const caExpiredAt = getInternalCaExpiredAt(ca.internalCa.notAfter);
    if (caExpiredAt) {
      throw new BadRequestError({
        message: `CA '${ca.name}' expired on ${caExpiredAt.toISOString()}. Renew the CA to publish a new CRL.`
      });
    }

    const crl = await rebuildCaCrl({
      caId: ca.id,
      certificateAuthorityDAL,
      certificateAuthorityCrlDAL,
      certificateAuthorityCertDAL,
      certificateAuthoritySecretDAL,
      projectDAL,
      certificateDAL,
      kmsService,
      caKeySourceService,
      keyStore
    });

    return { ca, crl };
  };

  return {
    getCrlById,
    getCaCrls,
    rebuildCrl
  };
};
