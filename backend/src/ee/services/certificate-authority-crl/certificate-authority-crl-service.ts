import { ForbiddenError } from "@casl/ability";
import * as x509 from "@peculiar/x509";

import { TCertificateAuthorityCrlDALFactory } from "@app/ee/services/certificate-authority-crl/certificate-authority-crl-dal";
import { TLicenseServiceFactory } from "@app/ee/services/license/license-service";
import { TPermissionServiceFactory } from "@app/ee/services/permission/permission-service";
import { ProjectPermissionActions, ProjectPermissionSub } from "@app/ee/services/permission/project-permission";
import { BadRequestError } from "@app/lib/errors";
import { TCertificateAuthorityDALFactory } from "@app/services/certificate-authority/certificate-authority-dal";
import { TKmsServiceFactory } from "@app/services/kms/kms-service";
import { TProjectDALFactory } from "@app/services/project/project-dal";
import { getProjectKmsCertificateKeyId } from "@app/services/project/project-fns";

import { TGetCrl } from "./certificate-authority-crl-types";

type TCertificateAuthorityCrlServiceFactoryDep = {
  certificateAuthorityDAL: Pick<TCertificateAuthorityDALFactory, "findById">;
  certificateAuthorityCrlDAL: Pick<TCertificateAuthorityCrlDALFactory, "findOne">;
  projectDAL: Pick<TProjectDALFactory, "findOne" | "updateById" | "transaction">;
  kmsService: Pick<TKmsServiceFactory, "decryptWithKmsKey" | "generateKmsKey">;
  permissionService: Pick<TPermissionServiceFactory, "getProjectPermission">;
  licenseService: Pick<TLicenseServiceFactory, "getPlan">;
};

export type TCertificateAuthorityCrlServiceFactory = ReturnType<typeof certificateAuthorityCrlServiceFactory>;

export const certificateAuthorityCrlServiceFactory = ({
  certificateAuthorityDAL,
  certificateAuthorityCrlDAL,
  projectDAL,
  kmsService,
  permissionService,
  licenseService
}: TCertificateAuthorityCrlServiceFactoryDep) => {
  /**
   * Return the Certificate Revocation List (CRL) for CA with id [caId]
   */
  const getCaCrl = async ({ caId, actorId, actorAuthMethod, actor, actorOrgId }: TGetCrl) => {
    const ca = await certificateAuthorityDAL.findById(caId);
    if (!ca) throw new BadRequestError({ message: "CA not found" });

    const { permission } = await permissionService.getProjectPermission(
      actor,
      actorId,
      ca.projectId,
      actorAuthMethod,
      actorOrgId
    );

    ForbiddenError.from(permission).throwUnlessCan(
      ProjectPermissionActions.Read,
      ProjectPermissionSub.CertificateAuthorities
    );

    const plan = await licenseService.getPlan(actorOrgId);
    if (!plan.caCrl)
      throw new BadRequestError({
        message:
          "Failed to get CA certificate revocation list (CRL) due to plan restriction. Upgrade plan to get the CA CRL."
      });

    const caCrl = await certificateAuthorityCrlDAL.findOne({ caId: ca.id });
    if (!caCrl) throw new BadRequestError({ message: "CRL not found" });

    const keyId = await getProjectKmsCertificateKeyId({
      projectId: ca.projectId,
      projectDAL,
      kmsService
    });

    const kmsDecryptor = await kmsService.decryptWithKmsKey({
      kmsId: keyId
    });

    const decryptedCrl = kmsDecryptor({ cipherTextBlob: caCrl.encryptedCrl });
    const crl = new x509.X509Crl(decryptedCrl);

    const base64crl = crl.toString("base64");
    const crlPem = `-----BEGIN X509 CRL-----\n${base64crl.match(/.{1,64}/g)?.join("\n")}\n-----END X509 CRL-----`;

    return {
      crl: crlPem,
      ca
    };
  };

  // const rotateCaCrl = async ({ caId, actorId, actorAuthMethod, actor, actorOrgId }: TRotateCrlDTO) => {
  //   const ca = await certificateAuthorityDAL.findById(caId);
  //   if (!ca) throw new BadRequestError({ message: "CA not found" });

  //   const { permission } = await permissionService.getProjectPermission(
  //     actor,
  //     actorId,
  //     ca.projectId,
  //     actorAuthMethod,
  //     actorOrgId
  //   );

  //   ForbiddenError.from(permission).throwUnlessCan(
  //     ProjectPermissionActions.Read,
  //     ProjectPermissionSub.CertificateAuthorities
  //   );

  //   const caSecret = await certificateAuthoritySecretDAL.findOne({ caId: ca.id });

  //   const alg = keyAlgorithmToAlgCfg(ca.keyAlgorithm as CertKeyAlgorithm);

  //   const keyId = await getProjectKmsCertificateKeyId({
  //     projectId: ca.projectId,
  //     projectDAL,
  //     kmsService
  //   });

  //   const privateKey = await kmsService.decrypt({
  //     kmsId: keyId,
  //     cipherTextBlob: caSecret.encryptedPrivateKey
  //   });

  //   const skObj = crypto.createPrivateKey({ key: privateKey, format: "der", type: "pkcs8" });
  //   const sk = await crypto.subtle.importKey("pkcs8", skObj.export({ format: "der", type: "pkcs8" }), alg, true, [
  //     "sign"
  //   ]);

  //   const revokedCerts = await certificateDAL.find({
  //     caId: ca.id,
  //     status: CertStatus.REVOKED
  //   });

  //   const crl = await x509.X509CrlGenerator.create({
  //     issuer: ca.dn,
  //     thisUpdate: new Date(),
  //     nextUpdate: new Date("2025/12/12"),
  //     entries: revokedCerts.map((revokedCert) => {
  //       return {
  //         serialNumber: revokedCert.serialNumber,
  //         revocationDate: new Date(revokedCert.revokedAt as Date),
  //         reason: revokedCert.revocationReason as number,
  //         invalidity: new Date("2022/01/01"),
  //         issuer: ca.dn
  //       };
  //     }),
  //     signingAlgorithm: alg,
  //     signingKey: sk
  //   });

  //   const { cipherTextBlob: encryptedCrl } = await kmsService.encrypt({
  //     kmsId: keyId,
  //     plainText: Buffer.from(new Uint8Array(crl.rawData))
  //   });

  //   await certificateAuthorityCrlDAL.update(
  //     {
  //       caId: ca.id
  //     },
  //     {
  //       encryptedCrl
  //     }
  //   );

  //   const base64crl = crl.toString("base64");
  //   const crlPem = `-----BEGIN X509 CRL-----\n${base64crl.match(/.{1,64}/g)?.join("\n")}\n-----END X509 CRL-----`;

  //   return {
  //     crl: crlPem
  //   };
  // };

  return {
    getCaCrl
    // rotateCaCrl
  };
};
