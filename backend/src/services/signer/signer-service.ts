import { ForbiddenError } from "@casl/ability";
import RE2 from "re2";

import { ActionProjectType } from "@app/db/schemas";
import { TPermissionServiceFactory } from "@app/ee/services/permission/permission-service-types";
import {
  ProjectPermissionCodeSigningActions,
  ProjectPermissionSub
} from "@app/ee/services/permission/project-permission";
import { signingService } from "@app/lib/crypto/sign/signing";
import { AsymmetricKeyAlgorithm, SigningAlgorithm } from "@app/lib/crypto/sign/types";
import { crypto } from "@app/lib/crypto/cryptography";
import { BadRequestError, DatabaseError, ForbiddenRequestError, NotFoundError } from "@app/lib/errors";
import { logger } from "@app/lib/logger";

import { TApprovalPolicyDALFactory } from "../approval-policy/approval-policy-dal";
import { ApprovalPolicyType, ApprovalRequestGrantStatus } from "../approval-policy/approval-policy-enums";
import { TApprovalRequestGrantsDALFactory } from "../approval-policy/approval-request-dal";
import { TCodeSigningGrantAttributes } from "../approval-policy/code-signing/code-signing-policy-types";
import { TCertificateDALFactory } from "../certificate/certificate-dal";
import { getCertificateCredentials } from "../certificate/certificate-fns";
import { TCertificateSecretDALFactory } from "../certificate/certificate-secret-dal";
import { CertExtendedKeyUsage, CertStatus } from "../certificate/certificate-types";
import { TKmsServiceFactory } from "../kms/kms-service";
import { TProjectDALFactory } from "../project/project-dal";
import { SignerStatus, SigningOperationStatus } from "./signer-enums";
import { TSignerDALFactory } from "./signer-dal";
import { TSigningOperationDALFactory } from "./signing-operation-dal";
import {
  TCreateSignerDTO,
  TDeleteSignerDTO,
  TGetPublicKeyDTO,
  TGetSignerDTO,
  TListSignersDTO,
  TListSigningOperationsDTO,
  TSignDataDTO,
  TUpdateSignerDTO
} from "./signer-types";

const SIGNER_NAME_REGEX = new RE2("^[a-z0-9-]+$");

const MAX_DATA_BYTES = 128;

type TSignerServiceFactoryDep = {
  signerDAL: TSignerDALFactory;
  signingOperationDAL: TSigningOperationDALFactory;
  certificateDAL: Pick<TCertificateDALFactory, "findById">;
  certificateSecretDAL: Pick<TCertificateSecretDALFactory, "findOne">;
  projectDAL: Pick<TProjectDALFactory, "findOne" | "updateById" | "transaction">;
  kmsService: Pick<TKmsServiceFactory, "decryptWithKmsKey" | "generateKmsKey">;
  permissionService: Pick<TPermissionServiceFactory, "getProjectPermission">;
  approvalPolicyDAL: TApprovalPolicyDALFactory;
  approvalRequestGrantsDAL: TApprovalRequestGrantsDALFactory;
};

export type TSignerServiceFactory = ReturnType<typeof signerServiceFactory>;

const getKeyAlgorithm = (
  key: ReturnType<typeof crypto.nativeCrypto.createPrivateKey> | ReturnType<typeof crypto.nativeCrypto.createPublicKey>
): AsymmetricKeyAlgorithm => {
  const keyType = key.asymmetricKeyType;
  if (keyType === "rsa") {
    return AsymmetricKeyAlgorithm.RSA_4096;
  }
  if (keyType === "ec") {
    const { namedCurve } = key.asymmetricKeyDetails as { namedCurve?: string };
    if (namedCurve !== "prime256v1" && namedCurve !== "P-256") {
      throw new BadRequestError({ message: `Unsupported EC curve: ${namedCurve}. Only P-256 is supported.` });
    }
    return AsymmetricKeyAlgorithm.ECC_NIST_P256;
  }
  throw new BadRequestError({ message: `Unsupported key type: ${keyType}` });
};

const validateSigningAlgorithmForKey = (signingAlgorithm: SigningAlgorithm, keyAlgorithm: AsymmetricKeyAlgorithm) => {
  const isRsaKey = keyAlgorithm.startsWith("RSA");
  const isRsaAlgorithm = signingAlgorithm.startsWith("RSASSA");
  const isEccAlgorithm = signingAlgorithm.startsWith("ECDSA");

  if (isRsaKey && !isRsaAlgorithm) {
    throw new BadRequestError({
      message: `RSA key cannot be used with signing algorithm ${signingAlgorithm}`
    });
  }
  if (!isRsaKey && !isEccAlgorithm) {
    throw new BadRequestError({
      message: `ECC key cannot be used with signing algorithm ${signingAlgorithm}`
    });
  }
};

export const signerServiceFactory = ({
  signerDAL,
  signingOperationDAL,
  certificateDAL,
  certificateSecretDAL,
  projectDAL,
  kmsService,
  permissionService,
  approvalPolicyDAL,
  approvalRequestGrantsDAL
}: TSignerServiceFactoryDep) => {
  const create = async (dto: TCreateSignerDTO) => {
    const { permission } = await permissionService.getProjectPermission({
      actor: dto.actor,
      actorId: dto.actorId,
      projectId: dto.projectId,
      actorAuthMethod: dto.actorAuthMethod,
      actorOrgId: dto.actorOrgId,
      actionProjectType: ActionProjectType.CertificateManager
    });

    ForbiddenError.from(permission).throwUnlessCan(
      ProjectPermissionCodeSigningActions.Create,
      ProjectPermissionSub.CodeSigners
    );

    if (!SIGNER_NAME_REGEX.test(dto.name)) {
      throw new BadRequestError({
        message: "Signer name must contain only lowercase letters, numbers, and hyphens"
      });
    }

    const certificate = await certificateDAL.findById(dto.certificateId);
    if (!certificate) {
      throw new NotFoundError({ message: `Certificate with ID '${dto.certificateId}' not found` });
    }
    if (certificate.projectId !== dto.projectId) {
      throw new BadRequestError({ message: "Certificate must belong to the same project" });
    }

    if (certificate.status === CertStatus.REVOKED) {
      throw new BadRequestError({ message: "Certificate has been revoked" });
    }
    if (certificate.notAfter && new Date(certificate.notAfter) < new Date()) {
      throw new BadRequestError({ message: "Certificate has expired" });
    }

    const extendedKeyUsages = certificate.extendedKeyUsages as string[] | null;
    if (!extendedKeyUsages?.includes(CertExtendedKeyUsage.CODE_SIGNING)) {
      throw new BadRequestError({ message: "Certificate must have the codeSigning extended key usage" });
    }

    const certSecret = await certificateSecretDAL.findOne({ certId: dto.certificateId });
    if (!certSecret) {
      throw new BadRequestError({ message: "Certificate must have an associated private key" });
    }

    const approvalPolicy = await approvalPolicyDAL.findById(dto.approvalPolicyId);
    if (!approvalPolicy) {
      throw new NotFoundError({ message: `Approval policy with ID '${dto.approvalPolicyId}' not found` });
    }
    if (approvalPolicy.projectId !== dto.projectId) {
      throw new BadRequestError({ message: "Approval policy must belong to the same project" });
    }
    if (approvalPolicy.type !== ApprovalPolicyType.CertManagerCodeSigning) {
      throw new BadRequestError({
        message: "Approval policy must be of type cert-manager-code-signing"
      });
    }

    try {
      const signer = await signerDAL.create({
        projectId: dto.projectId,
        name: dto.name,
        description: dto.description,
        certificateId: dto.certificateId,
        approvalPolicyId: dto.approvalPolicyId,
        status: SignerStatus.Active
      });

      return signer;
    } catch (error) {
      // 23505 = unique constraint violation
      if (error instanceof DatabaseError && (error.error as { code?: string })?.code === "23505") {
        throw new BadRequestError({ message: `A signer with the name '${dto.name}' already exists in this project` });
      }
      throw error;
    }
  };

  const list = async (dto: TListSignersDTO) => {
    const { permission } = await permissionService.getProjectPermission({
      actor: dto.actor,
      actorId: dto.actorId,
      projectId: dto.projectId,
      actorAuthMethod: dto.actorAuthMethod,
      actorOrgId: dto.actorOrgId,
      actionProjectType: ActionProjectType.CertificateManager
    });

    ForbiddenError.from(permission).throwUnlessCan(
      ProjectPermissionCodeSigningActions.Read,
      ProjectPermissionSub.CodeSigners
    );

    const signers = await signerDAL.findByProjectId(dto.projectId, {
      offset: dto.offset,
      limit: dto.limit,
      search: dto.search
    });

    const totalCount = await signerDAL.countByProjectId(dto.projectId, dto.search);

    return { signers, totalCount };
  };

  const getById = async (dto: TGetSignerDTO) => {
    const signer = await signerDAL.findByIdWithCertificate(dto.signerId);
    if (!signer) {
      throw new NotFoundError({ message: `Signer with ID '${dto.signerId}' not found` });
    }

    const { permission } = await permissionService.getProjectPermission({
      actor: dto.actor,
      actorId: dto.actorId,
      projectId: signer.projectId,
      actorAuthMethod: dto.actorAuthMethod,
      actorOrgId: dto.actorOrgId,
      actionProjectType: ActionProjectType.CertificateManager
    });

    ForbiddenError.from(permission).throwUnlessCan(
      ProjectPermissionCodeSigningActions.Read,
      ProjectPermissionSub.CodeSigners
    );

    return signer;
  };

  const update = async (dto: TUpdateSignerDTO) => {
    const existingSigner = await signerDAL.findById(dto.signerId);
    if (!existingSigner) {
      throw new NotFoundError({ message: `Signer with ID '${dto.signerId}' not found` });
    }

    const { projectId } = existingSigner;

    const { permission } = await permissionService.getProjectPermission({
      actor: dto.actor,
      actorId: dto.actorId,
      projectId,
      actorAuthMethod: dto.actorAuthMethod,
      actorOrgId: dto.actorOrgId,
      actionProjectType: ActionProjectType.CertificateManager
    });

    ForbiddenError.from(permission).throwUnlessCan(
      ProjectPermissionCodeSigningActions.Edit,
      ProjectPermissionSub.CodeSigners
    );

    if (dto.name !== undefined && !SIGNER_NAME_REGEX.test(dto.name)) {
      throw new BadRequestError({
        message: "Signer name must contain only lowercase letters, numbers, and hyphens"
      });
    }

    if (dto.certificateId !== undefined) {
      const certificate = await certificateDAL.findById(dto.certificateId);
      if (!certificate) {
        throw new NotFoundError({ message: `Certificate with ID '${dto.certificateId}' not found` });
      }
      if (certificate.projectId !== projectId) {
        throw new BadRequestError({ message: "Certificate must belong to the same project" });
      }
      if (certificate.status === CertStatus.REVOKED) {
        throw new BadRequestError({ message: "Certificate has been revoked" });
      }
      if (certificate.notAfter && new Date(certificate.notAfter) < new Date()) {
        throw new BadRequestError({ message: "Certificate has expired" });
      }
      const extendedKeyUsages = certificate.extendedKeyUsages as string[] | null;
      if (!extendedKeyUsages?.includes(CertExtendedKeyUsage.CODE_SIGNING)) {
        throw new BadRequestError({ message: "Certificate must have the codeSigning extended key usage" });
      }
    }

    if (dto.approvalPolicyId !== undefined) {
      const approvalPolicy = await approvalPolicyDAL.findById(dto.approvalPolicyId);
      if (!approvalPolicy) {
        throw new NotFoundError({ message: `Approval policy with ID '${dto.approvalPolicyId}' not found` });
      }
      if (approvalPolicy.projectId !== projectId) {
        throw new BadRequestError({ message: "Approval policy must belong to the same project" });
      }
      if (approvalPolicy.type !== ApprovalPolicyType.CertManagerCodeSigning) {
        throw new BadRequestError({
          message: "Approval policy must be of type cert-manager-code-signing"
        });
      }
    }

    const signer = await signerDAL.updateById(dto.signerId, {
      name: dto.name,
      description: dto.description,
      status: dto.status,
      certificateId: dto.certificateId,
      approvalPolicyId: dto.approvalPolicyId
    });

    return signer;
  };

  const deleteSigner = async (dto: TDeleteSignerDTO) => {
    const existingSigner = await signerDAL.findById(dto.signerId);
    if (!existingSigner) {
      throw new NotFoundError({ message: `Signer with ID '${dto.signerId}' not found` });
    }

    const { permission } = await permissionService.getProjectPermission({
      actor: dto.actor,
      actorId: dto.actorId,
      projectId: existingSigner.projectId,
      actorAuthMethod: dto.actorAuthMethod,
      actorOrgId: dto.actorOrgId,
      actionProjectType: ActionProjectType.CertificateManager
    });

    ForbiddenError.from(permission).throwUnlessCan(
      ProjectPermissionCodeSigningActions.Delete,
      ProjectPermissionSub.CodeSigners
    );

    await signerDAL.deleteById(dto.signerId);
    return existingSigner;
  };

  const sign = async (dto: TSignDataDTO) => {
    const signer = await signerDAL.findByIdWithCertificate(dto.signerId);
    if (!signer) {
      throw new NotFoundError({ message: `Signer with ID '${dto.signerId}' not found` });
    }

    const { projectId } = signer;

    const { permission } = await permissionService.getProjectPermission({
      actor: dto.actor,
      actorId: dto.actorId,
      projectId,
      actorAuthMethod: dto.actorAuthMethod,
      actorOrgId: dto.actorOrgId,
      actionProjectType: ActionProjectType.CertificateManager
    });

    ForbiddenError.from(permission).throwUnlessCan(
      ProjectPermissionCodeSigningActions.Sign,
      ProjectPermissionSub.CodeSigners
    );

    if (signer.status !== SignerStatus.Active) {
      throw new BadRequestError({ message: `Signer '${signer.name}' is not active (status: ${signer.status})` });
    }
    if (signer.certificateNotAfter && new Date() > new Date(signer.certificateNotAfter)) {
      throw new BadRequestError({ message: `Certificate for signer '${signer.name}' has expired` });
    }

    const dataBuffer = Buffer.from(dto.data, "base64");
    if (dataBuffer.length > MAX_DATA_BYTES) {
      throw new BadRequestError({
        message: `Data exceeds maximum size of ${MAX_DATA_BYTES} bytes`
      });
    }

    const dataHash = crypto.nativeCrypto.createHash("sha256").update(dataBuffer).digest("hex");

    const { certPrivateKey } = await getCertificateCredentials({
      certId: signer.certificateId,
      projectId,
      certificateSecretDAL,
      projectDAL,
      kmsService
    });

    const privateKeyObject = crypto.nativeCrypto.createPrivateKey({
      key: certPrivateKey,
      format: "pem",
      type: "pkcs8"
    });

    const keyAlgorithm = getKeyAlgorithm(privateKeyObject);
    validateSigningAlgorithmForKey(dto.signingAlgorithm, keyAlgorithm);

    const result = await projectDAL.transaction(async (tx) => {
      const [userGrants, identityGrants] = await Promise.all([
        approvalRequestGrantsDAL.find(
          {
            granteeUserId: dto.actorId,
            type: ApprovalPolicyType.CertManagerCodeSigning,
            status: ApprovalRequestGrantStatus.Active,
            projectId,
            revokedAt: null
          },
          { tx }
        ),
        approvalRequestGrantsDAL.find(
          {
            granteeMachineIdentityId: dto.actorId,
            type: ApprovalPolicyType.CertManagerCodeSigning,
            status: ApprovalRequestGrantStatus.Active,
            projectId,
            revokedAt: null
          },
          { tx }
        )
      ]);

      const activeGrants = [...userGrants, ...identityGrants];

      let matchingGrant: (typeof activeGrants)[number] | undefined;

      for (const grant of activeGrants) {
        const attrs = grant.attributes as TCodeSigningGrantAttributes | null;
        if (!attrs || attrs.signerId !== signer.id) continue;

        const now = new Date();

        if (attrs.windowStart && new Date(attrs.windowStart) > now) continue;

        if (grant.expiresAt && new Date(grant.expiresAt) < now) {
          await approvalRequestGrantsDAL.updateById(grant.id, { status: ApprovalRequestGrantStatus.Expired }, tx);
          continue;
        }

        if (attrs.maxSignings) {
          const usedCount = await signingOperationDAL.countByGrantId(grant.id, tx);
          if (usedCount >= attrs.maxSignings) {
            await approvalRequestGrantsDAL.updateById(grant.id, { status: ApprovalRequestGrantStatus.Expired }, tx);
            continue;
          }
        }

        matchingGrant = grant;
        break;
      }

      if (!matchingGrant) {
        throw new ForbiddenRequestError({
          message: "Signing requires approval. Request access and get approved before signing.",
          name: "ApprovalRequired"
        });
      }

      const grantId = matchingGrant.id;

      let signatureBuffer: Buffer;

      try {
        const privateKeyPem = Buffer.from(certPrivateKey);
        const svc = signingService(keyAlgorithm);
        signatureBuffer = await svc.sign(dataBuffer, privateKeyPem, dto.signingAlgorithm, dto.isDigest);
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : "Unknown signing error";
        logger.error(error, `Code signing failed for signer '${signer.name}'`);

        await signingOperationDAL.create(
          {
            signerId: dto.signerId,
            projectId,
            status: SigningOperationStatus.Failed,
            signingAlgorithm: dto.signingAlgorithm,
            dataHash,
            actorType: dto.actor,
            actorId: dto.actorId,
            approvalGrantId: grantId,
            clientMetadata: dto.clientMetadata ?? null,
            errorMessage: errorMessage.substring(0, 255)
          },
          tx
        );

        throw error;
      }

      await signingOperationDAL.create(
        {
          signerId: dto.signerId,
          projectId,
          status: SigningOperationStatus.Success,
          signingAlgorithm: dto.signingAlgorithm,
          dataHash,
          actorType: dto.actor,
          actorId: dto.actorId,
          approvalGrantId: grantId,
          clientMetadata: dto.clientMetadata ?? null
        },
        tx
      );

      const grantAttrs = matchingGrant.attributes as TCodeSigningGrantAttributes | null;
      if (grantAttrs?.maxSignings) {
        const newCount = await signingOperationDAL.countByGrantId(grantId, tx);
        if (newCount >= grantAttrs.maxSignings) {
          await approvalRequestGrantsDAL.updateById(grantId, { status: ApprovalRequestGrantStatus.Expired }, tx);
        }
      }

      await signerDAL.updateById(dto.signerId, { lastSignedAt: new Date() }, tx);

      return {
        signature: signatureBuffer.toString("base64"),
        signingAlgorithm: dto.signingAlgorithm,
        signerId: dto.signerId,
        signerName: signer.name,
        projectId
      };
    });

    return result;
  };

  const getPublicKey = async (dto: TGetPublicKeyDTO) => {
    const signer = await signerDAL.findById(dto.signerId);
    if (!signer) {
      throw new NotFoundError({ message: `Signer with ID '${dto.signerId}' not found` });
    }

    const { projectId } = signer;

    const { permission } = await permissionService.getProjectPermission({
      actor: dto.actor,
      actorId: dto.actorId,
      projectId,
      actorAuthMethod: dto.actorAuthMethod,
      actorOrgId: dto.actorOrgId,
      actionProjectType: ActionProjectType.CertificateManager
    });

    ForbiddenError.from(permission).throwUnlessCan(
      ProjectPermissionCodeSigningActions.Read,
      ProjectPermissionSub.CodeSigners
    );

    const { certPublicKey } = await getCertificateCredentials({
      certId: signer.certificateId,
      projectId,
      certificateSecretDAL,
      projectDAL,
      kmsService
    });

    const publicKeyObject = crypto.nativeCrypto.createPublicKey({
      key: certPublicKey,
      format: "pem",
      type: "spki"
    });

    const publicKeyDer = publicKeyObject.export({ format: "der", type: "spki" });

    const keyAlgorithm = getKeyAlgorithm(publicKeyObject);

    return {
      publicKey: publicKeyDer.toString("base64"),
      algorithm: keyAlgorithm,
      signerName: signer.name,
      projectId
    };
  };

  const listOperations = async (dto: TListSigningOperationsDTO) => {
    const signer = await signerDAL.findById(dto.signerId);
    if (!signer) {
      throw new NotFoundError({ message: `Signer with ID '${dto.signerId}' not found` });
    }

    const { permission } = await permissionService.getProjectPermission({
      actor: dto.actor,
      actorId: dto.actorId,
      projectId: signer.projectId,
      actorAuthMethod: dto.actorAuthMethod,
      actorOrgId: dto.actorOrgId,
      actionProjectType: ActionProjectType.CertificateManager
    });

    ForbiddenError.from(permission).throwUnlessCan(
      ProjectPermissionCodeSigningActions.Read,
      ProjectPermissionSub.CodeSigners
    );

    const operations = await signingOperationDAL.findBySignerId(dto.signerId, {
      offset: dto.offset,
      limit: dto.limit,
      status: dto.status
    });

    const totalCount = await signingOperationDAL.countBySignerId(dto.signerId, dto.status);

    return { operations, totalCount, projectId: signer.projectId };
  };

  return {
    create,
    list,
    getById,
    update,
    delete: deleteSigner,
    sign,
    getPublicKey,
    listOperations
  };
};
