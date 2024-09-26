import { ForbiddenError } from "@casl/ability";
import * as x509 from "@peculiar/x509";

import { TCertificateAuthorityCrlDALFactory } from "@app/ee/services/certificate-authority-crl/certificate-authority-crl-dal";
import { TPermissionServiceFactory } from "@app/ee/services/permission/permission-service";
import { ProjectPermissionActions, ProjectPermissionSub } from "@app/ee/services/permission/project-permission";
import { NotFoundError } from "@app/lib/errors";
import { TCertificateAuthorityDALFactory } from "@app/services/certificate-authority/certificate-authority-dal";
import { TKmsServiceFactory } from "@app/services/kms/kms-service";
import { TProjectDALFactory } from "@app/services/project/project-dal";
import { getProjectKmsCertificateKeyId } from "@app/services/project/project-fns";

import { TGetCaCrlsDTO, TGetCrlById } from "./certificate-authority-crl-types";

type TCertificateAuthorityCrlServiceFactoryDep = {
  certificateAuthorityDAL: Pick<TCertificateAuthorityDALFactory, "findById">;
  certificateAuthorityCrlDAL: Pick<TCertificateAuthorityCrlDALFactory, "find" | "findById">;
  projectDAL: Pick<TProjectDALFactory, "findOne" | "updateById" | "transaction">;
  kmsService: Pick<TKmsServiceFactory, "decryptWithKmsKey" | "generateKmsKey">;
  permissionService: Pick<TPermissionServiceFactory, "getProjectPermission">;
};

export type TCertificateAuthorityCrlServiceFactory = ReturnType<typeof certificateAuthorityCrlServiceFactory>;

export const certificateAuthorityCrlServiceFactory = ({
  certificateAuthorityDAL,
  certificateAuthorityCrlDAL,
  projectDAL,
  kmsService,
  permissionService // licenseService
}: TCertificateAuthorityCrlServiceFactoryDep) => {
  /**
   * Return CRL with id [crlId]
   */
  const getCrlById = async (crlId: TGetCrlById) => {
    const caCrl = await certificateAuthorityCrlDAL.findById(crlId);
    if (!caCrl) throw new NotFoundError({ message: "CRL not found" });

    const ca = await certificateAuthorityDAL.findById(caCrl.caId);

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
      ca,
      caCrl,
      crl: crl.rawData
    };
  };

  /**
   * Returns a list of CRL ids for CA with id [caId]
   */
  const getCaCrls = async ({ caId, actorId, actorAuthMethod, actor, actorOrgId }: TGetCaCrlsDTO) => {
    const ca = await certificateAuthorityDAL.findById(caId);
    if (!ca) throw new NotFoundError({ message: "CA not found" });

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
          crl: crlPem
        };
      })
    );

    return {
      ca,
      crls: decryptedCrls
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
    getCrlById,
    getCaCrls
    // rotateCaCrl
  };
};
