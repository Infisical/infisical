import { ForbiddenError } from "@casl/ability";
import * as x509 from "@peculiar/x509";
import crypto, { KeyObject } from "crypto";
import ms from "ms";

import { ActionProjectType } from "@app/db/schemas";
import { BadRequestError, InternalServerError, NotFoundError } from "@app/lib/errors";
import { CertExtendedKeyUsage, CertKeyAlgorithm, CertKeyUsage } from "@app/services/certificate/certificate-types";
import {
  createSerialNumber,
  keyAlgorithmToAlgCfg
} from "@app/services/certificate-authority/certificate-authority-fns";
import { TKmsServiceFactory } from "@app/services/kms/kms-service";

import { TPermissionServiceFactory } from "../permission/permission-service";
import { ProjectPermissionKmipActions, ProjectPermissionSub } from "../permission/project-permission";
import { TKmipClientCertificateDALFactory } from "./kmip-client-certificate-dal";
import { TKmipClientDALFactory } from "./kmip-client-dal";
import { INSTANCE_KMIP_CONFIG_ID } from "./kmip-constants";
import { TKmipInstanceConfigDALFactory } from "./kmip-instance-config-dal";
import { TKmipInstanceServerCertificateDALFactory } from "./kmip-instance-server-certificate-dal";
import {
  TCreateKmipClientCertificateDTO,
  TCreateKmipClientDTO,
  TDeleteKmipClientDTO,
  TGetKmipClientDTO,
  TListKmipClientsByProjectIdDTO,
  TUpdateKmipClientDTO
} from "./kmip-types";

type TKmipServiceFactoryDep = {
  kmipClientDAL: TKmipClientDALFactory;
  kmipClientCertificateDAL: TKmipClientCertificateDALFactory;
  kmipInstanceServerCertificateDAL: TKmipInstanceServerCertificateDALFactory;
  permissionService: Pick<TPermissionServiceFactory, "getProjectPermission">;
  kmsService: Pick<TKmsServiceFactory, "decryptWithRootKey">;
  kmipInstanceConfigDAL: TKmipInstanceConfigDALFactory;
};

export type TKmipServiceFactory = ReturnType<typeof kmipServiceFactory>;

export const kmipServiceFactory = ({
  kmipClientDAL,
  permissionService,
  kmipClientCertificateDAL,
  kmipInstanceConfigDAL,
  kmsService,
  kmipInstanceServerCertificateDAL
}: TKmipServiceFactoryDep) => {
  const createKmipClient = async ({
    actor,
    actorId,
    actorOrgId,
    actorAuthMethod,
    projectId,
    name,
    description,
    permissions
  }: TCreateKmipClientDTO) => {
    const { permission } = await permissionService.getProjectPermission({
      actor,
      actorId,
      projectId,
      actorAuthMethod,
      actorOrgId,
      actionProjectType: ActionProjectType.KMS
    });

    ForbiddenError.from(permission).throwUnlessCan(
      ProjectPermissionKmipActions.CreateClients,
      ProjectPermissionSub.Kmip
    );

    const kmipClient = await kmipClientDAL.create({
      projectId,
      name,
      description,
      permissions
    });

    return kmipClient;
  };

  const updateKmipClient = async ({
    actor,
    actorId,
    actorOrgId,
    actorAuthMethod,
    name,
    description,
    permissions,
    id
  }: TUpdateKmipClientDTO) => {
    const kmipClient = await kmipClientDAL.findById(id);

    if (!kmipClient) {
      throw new NotFoundError({
        message: `KMIP client with ID ${id} does not exist`
      });
    }

    const { permission } = await permissionService.getProjectPermission({
      actor,
      actorId,
      projectId: kmipClient.projectId,
      actorAuthMethod,
      actorOrgId,
      actionProjectType: ActionProjectType.KMS
    });

    ForbiddenError.from(permission).throwUnlessCan(
      ProjectPermissionKmipActions.UpdateClients,
      ProjectPermissionSub.Kmip
    );

    const updatedKmipClient = await kmipClientDAL.updateById(id, {
      name,
      description,
      permissions
    });

    return updatedKmipClient;
  };

  const deleteKmipClient = async ({ actor, actorId, actorOrgId, actorAuthMethod, id }: TDeleteKmipClientDTO) => {
    const kmipClient = await kmipClientDAL.findById(id);

    if (!kmipClient) {
      throw new NotFoundError({
        message: `KMIP client with ID ${id} does not exist`
      });
    }

    const { permission } = await permissionService.getProjectPermission({
      actor,
      actorId,
      projectId: kmipClient.projectId,
      actorAuthMethod,
      actorOrgId,
      actionProjectType: ActionProjectType.KMS
    });

    ForbiddenError.from(permission).throwUnlessCan(
      ProjectPermissionKmipActions.DeleteClients,
      ProjectPermissionSub.Kmip
    );

    const deletedKmipClient = await kmipClientDAL.deleteById(id);

    return deletedKmipClient;
  };

  const getKmipClient = async ({ actor, actorId, actorOrgId, actorAuthMethod, id }: TGetKmipClientDTO) => {
    const kmipClient = await kmipClientDAL.findById(id);

    if (!kmipClient) {
      throw new NotFoundError({
        message: `KMIP client with ID ${id} does not exist`
      });
    }

    const { permission } = await permissionService.getProjectPermission({
      actor,
      actorId,
      projectId: kmipClient.projectId,
      actorAuthMethod,
      actorOrgId,
      actionProjectType: ActionProjectType.KMS
    });

    ForbiddenError.from(permission).throwUnlessCan(ProjectPermissionKmipActions.ReadClients, ProjectPermissionSub.Kmip);

    return kmipClient;
  };

  const listKmipClientsByProjectId = async ({
    actor,
    actorId,
    actorOrgId,
    actorAuthMethod,
    projectId,
    ...rest
  }: TListKmipClientsByProjectIdDTO) => {
    const { permission } = await permissionService.getProjectPermission({
      actor,
      actorId,
      projectId,
      actorAuthMethod,
      actorOrgId,
      actionProjectType: ActionProjectType.KMS
    });

    ForbiddenError.from(permission).throwUnlessCan(ProjectPermissionKmipActions.ReadClients, ProjectPermissionSub.Kmip);

    return kmipClientDAL.findByProjectId({ projectId, ...rest });
  };

  const createKmipClientCertificate = async ({
    actor,
    actorId,
    actorOrgId,
    actorAuthMethod,
    ttl,
    keyAlgorithm,
    clientId
  }: TCreateKmipClientCertificateDTO) => {
    const kmipClient = await kmipClientDAL.findById(clientId);

    if (!kmipClient) {
      throw new NotFoundError({
        message: `KMIP client with ID ${clientId} does not exist`
      });
    }

    const { permission } = await permissionService.getProjectPermission({
      actor,
      actorId,
      projectId: kmipClient.projectId,
      actorAuthMethod,
      actorOrgId,
      actionProjectType: ActionProjectType.KMS
    });

    ForbiddenError.from(permission).throwUnlessCan(
      ProjectPermissionKmipActions.GenerateClientCertificates,
      ProjectPermissionSub.Kmip
    );

    const kmipInstanceConfig = await kmipInstanceConfigDAL.findById(INSTANCE_KMIP_CONFIG_ID);
    if (!kmipInstanceConfig) {
      throw new InternalServerError({
        message: "KMIP has not been configured for the instance."
      });
    }

    const decryptWithRoot = kmsService.decryptWithRootKey();

    const caCertObj = new x509.X509Certificate(
      decryptWithRoot(kmipInstanceConfig.encryptedClientIntermediateCaCertificate)
    );

    const notBeforeDate = new Date();
    const notAfterDate = new Date(new Date().getTime() + ms(ttl));

    const caCertNotBeforeDate = new Date(caCertObj.notBefore);
    const caCertNotAfterDate = new Date(caCertObj.notAfter);

    // check not before constraint
    if (notBeforeDate < caCertNotBeforeDate) {
      throw new BadRequestError({ message: "notBefore date is before CA certificate's notBefore date" });
    }

    if (notBeforeDate > notAfterDate) throw new BadRequestError({ message: "notBefore date is after notAfter date" });

    // check not after constraint
    if (notAfterDate > caCertNotAfterDate) {
      throw new BadRequestError({ message: "notAfter date is after CA certificate's notAfter date" });
    }

    const alg = keyAlgorithmToAlgCfg(keyAlgorithm);
    const leafKeys = await crypto.subtle.generateKey(alg, true, ["sign", "verify"]);

    const extensions: x509.Extension[] = [
      new x509.BasicConstraintsExtension(false),
      await x509.AuthorityKeyIdentifierExtension.create(caCertObj, false),
      await x509.SubjectKeyIdentifierExtension.create(leafKeys.publicKey),
      new x509.CertificatePolicyExtension(["2.5.29.32.0"]), // anyPolicy
      new x509.KeyUsagesExtension(
        // eslint-disable-next-line no-bitwise
        x509.KeyUsageFlags[CertKeyUsage.DIGITAL_SIGNATURE] |
          x509.KeyUsageFlags[CertKeyUsage.KEY_ENCIPHERMENT] |
          x509.KeyUsageFlags[CertKeyUsage.KEY_AGREEMENT],
        true
      ),
      new x509.ExtendedKeyUsageExtension([x509.ExtendedKeyUsage[CertExtendedKeyUsage.CLIENT_AUTH]], true)
    ];

    const caAlg = keyAlgorithmToAlgCfg(kmipInstanceConfig.caKeyAlgorithm as CertKeyAlgorithm);

    const decryptedCaCertChain = decryptWithRoot(kmipInstanceConfig.encryptedClientIntermediateCaChain).toString(
      "utf-8"
    );

    const caSkObj = crypto.createPrivateKey({
      key: decryptWithRoot(kmipInstanceConfig.encryptedClientIntermediateCaPrivateKey),
      format: "der",
      type: "pkcs8"
    });

    const caPrivateKey = await crypto.subtle.importKey(
      "pkcs8",
      caSkObj.export({ format: "der", type: "pkcs8" }),
      caAlg,
      true,
      ["sign"]
    );

    const serialNumber = createSerialNumber();
    const leafCert = await x509.X509CertificateGenerator.create({
      serialNumber,
      subject: `OU=${kmipClient.projectId},CN=${clientId}`,
      issuer: caCertObj.subject,
      notBefore: notBeforeDate,
      notAfter: notAfterDate,
      signingKey: caPrivateKey,
      publicKey: leafKeys.publicKey,
      signingAlgorithm: alg,
      extensions
    });

    const skLeafObj = KeyObject.from(leafKeys.privateKey);
    const certificateChain = `${caCertObj.toString("pem")}\n${decryptedCaCertChain}`.trim();

    await kmipClientCertificateDAL.create({
      kmipClientId: clientId,
      keyAlgorithm,
      issuedAt: notBeforeDate,
      expiration: notAfterDate,
      serialNumber
    });

    return {
      serialNumber,
      privateKey: skLeafObj.export({ format: "pem", type: "pkcs8" }) as string,
      certificate: leafCert.toString("pem"),
      certificateChain,
      projectId: kmipClient.projectId
    };
  };

  const getServerCertificateBySerialNumber = async (serialNumber: string) => {
    const serverCert = await kmipInstanceServerCertificateDAL.findOne({
      serialNumber
    });

    if (!serverCert) {
      throw new NotFoundError({
        message: "Server certificate not found"
      });
    }

    const decryptWithRootKey = kmsService.decryptWithRootKey();
    const parsedCertificate = new x509.X509Certificate(decryptWithRootKey(serverCert.encryptedCertificate));

    return {
      publicKey: parsedCertificate.publicKey.toString("pem"),
      keyAlgorithm: serverCert.keyAlgorithm as CertKeyAlgorithm
    };
  };

  return {
    createKmipClient,
    updateKmipClient,
    deleteKmipClient,
    getKmipClient,
    listKmipClientsByProjectId,
    createKmipClientCertificate,
    getServerCertificateBySerialNumber
  };
};
