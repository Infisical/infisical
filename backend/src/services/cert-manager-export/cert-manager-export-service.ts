/* eslint-disable no-await-in-loop */
import { OrganizationActionScope, OrgMembershipRole, ProjectType, TableName } from "@app/db/schemas";
import { TCertificateAuthorityCrlDALFactory } from "@app/ee/services/certificate-authority-crl/certificate-authority-crl-dal";
import { TPermissionServiceFactory } from "@app/ee/services/permission/permission-service-types";
import { BadRequestError, ForbiddenRequestError, InternalServerError, NotFoundError } from "@app/lib/errors";
import { alphaNumericNanoId } from "@app/lib/nanoid";
import { ActorType } from "@app/services/auth/auth-type";
import { TCertificateAuthorityCertDALFactory } from "@app/services/certificate-authority/certificate-authority-cert-dal";
import { TCertificateAuthorityDALFactory } from "@app/services/certificate-authority/certificate-authority-dal";
import { TCertificateAuthoritySecretDALFactory } from "@app/services/certificate-authority/certificate-authority-secret-dal";
import { TInternalCertificateAuthorityDALFactory } from "@app/services/certificate-authority/internal/internal-certificate-authority-dal";
import { TCertificatePolicyDALFactory } from "@app/services/certificate-policy/certificate-policy-dal";
import { TCertificateProfileDALFactory } from "@app/services/certificate-profile/certificate-profile-dal";
import { IssuerType } from "@app/services/certificate-profile/certificate-profile-types";
import { TKmsServiceFactory } from "@app/services/kms/kms-service";
import { TOrgDALFactory } from "@app/services/org/org-dal";
import { TProjectDALFactory } from "@app/services/project/project-dal";
import { getProjectKmsCertificateKeyId } from "@app/services/project/project-fns";
import { CertKeySource } from "@app/services/signer/signer-enums";

import { TExportCertManagerProjectDTO, TExportCertManagerProjectResult } from "./cert-manager-export-types";

type TCertManagerExportServiceFactoryDep = {
  certificateAuthorityDAL: Pick<
    TCertificateAuthorityDALFactory,
    "find" | "findWithAssociatedCa" | "create" | "transaction"
  >;
  internalCertificateAuthorityDAL: Pick<TInternalCertificateAuthorityDALFactory, "create">;
  certificateAuthorityCertDAL: Pick<TCertificateAuthorityCertDALFactory, "find" | "create">;
  certificateAuthoritySecretDAL: Pick<TCertificateAuthoritySecretDALFactory, "find" | "create">;
  certificateAuthorityCrlDAL: Pick<TCertificateAuthorityCrlDALFactory, "findOne" | "create">;
  certificatePolicyDAL: Pick<TCertificatePolicyDALFactory, "find">;
  certificateProfileDAL: Pick<TCertificateProfileDALFactory, "find">;
  projectDAL: Pick<TProjectDALFactory, "findById" | "findOne" | "updateById" | "transaction">;
  orgDAL: Pick<TOrgDALFactory, "findById">;
  kmsService: Pick<TKmsServiceFactory, "encryptWithKmsKey" | "decryptWithKmsKey" | "generateKmsKey">;
  permissionService: Pick<TPermissionServiceFactory, "getOrgPermission">;
};

export type TCertManagerExportServiceFactory = ReturnType<typeof certManagerExportServiceFactory>;

export const certManagerExportServiceFactory = ({
  certificateAuthorityDAL,
  internalCertificateAuthorityDAL,
  certificateAuthorityCertDAL,
  certificateAuthoritySecretDAL,
  certificateAuthorityCrlDAL,
  certificatePolicyDAL,
  certificateProfileDAL,
  projectDAL,
  orgDAL,
  kmsService,
  permissionService
}: TCertManagerExportServiceFactoryDep) => {
  const allocateUniqueName = (desired: string, taken: Set<string>): string => {
    if (!taken.has(desired)) return desired;
    let candidate: string;
    do {
      candidate = `${desired}-${alphaNumericNanoId(8).toLowerCase()}`;
    } while (taken.has(candidate));
    return candidate;
  };

  const toJsonbValue = (value: unknown): string | null => {
    if (value === null || value === undefined) return null;
    if (typeof value === "string") return value;
    return JSON.stringify(value);
  };

  const exportCertManagerProject = async ({
    sourceProjectId,
    actor,
    actorId,
    actorOrgId,
    actorAuthMethod
  }: TExportCertManagerProjectDTO): Promise<TExportCertManagerProjectResult> => {
    if (actor !== ActorType.USER && actor !== ActorType.IDENTITY) {
      throw new BadRequestError({ message: "Invalid actor for cert manager export" });
    }

    const { hasRole } = await permissionService.getOrgPermission({
      actor,
      actorId,
      orgId: actorOrgId,
      actorAuthMethod,
      actorOrgId,
      scope: OrganizationActionScope.Any
    });
    if (!hasRole(OrgMembershipRole.Admin)) {
      throw new ForbiddenRequestError({
        message: "Only organization admins can export cert manager entities between projects"
      });
    }

    const org = await orgDAL.findById(actorOrgId);
    if (!org) {
      throw new NotFoundError({ message: `Organization with ID '${actorOrgId}' not found` });
    }
    const destinationProjectId = org.defaultCertManagerProjectId;
    if (!destinationProjectId) {
      throw new BadRequestError({
        message: "Set an active Certificate Manager instance for the organization before exporting"
      });
    }
    if (sourceProjectId === destinationProjectId) {
      throw new BadRequestError({
        message: "Source project is already the active Certificate Manager instance"
      });
    }

    const sourceProject = await projectDAL.findById(sourceProjectId);
    if (!sourceProject) {
      throw new NotFoundError({ message: `Source project with ID '${sourceProjectId}' not found` });
    }
    const destinationProject = await projectDAL.findById(destinationProjectId);
    if (!destinationProject) {
      throw new NotFoundError({ message: `Destination project with ID '${destinationProjectId}' not found` });
    }
    if (sourceProject.orgId !== actorOrgId || destinationProject.orgId !== actorOrgId) {
      throw new ForbiddenRequestError({
        message: "Both projects must belong to your organization"
      });
    }
    if (
      sourceProject.type !== ProjectType.CertificateManager ||
      destinationProject.type !== ProjectType.CertificateManager
    ) {
      throw new BadRequestError({
        message: "Both source and destination must be Certificate Manager projects"
      });
    }

    const sourceKmsKeyId = await getProjectKmsCertificateKeyId({
      projectId: sourceProjectId,
      projectDAL,
      kmsService
    });
    const destinationKmsKeyId = await getProjectKmsCertificateKeyId({
      projectId: destinationProjectId,
      projectDAL,
      kmsService
    });

    const sourceDecryptor = await kmsService.decryptWithKmsKey({ kmsId: sourceKmsKeyId });
    const destinationEncryptor = await kmsService.encryptWithKmsKey({ kmsId: destinationKmsKeyId });

    const reencrypt = async (cipherTextBlob: Buffer): Promise<Buffer> => {
      const plainText = await sourceDecryptor({ cipherTextBlob });
      const { cipherTextBlob: encrypted } = await destinationEncryptor({ plainText });
      return encrypted;
    };

    return certificateAuthorityDAL.transaction(async (tx) => {
      const existingDestCAs = await certificateAuthorityDAL.find({ projectId: destinationProjectId }, { tx });
      const destCaNames = new Set(existingDestCAs.map((ca) => ca.name));

      const existingDestPolicies = await certificatePolicyDAL.find({ projectId: destinationProjectId }, { tx });
      const destPolicyNames = new Set(existingDestPolicies.map((policy) => policy.name));

      const existingDestProfiles = await certificateProfileDAL.find({ projectId: destinationProjectId }, { tx });
      const destProfileSlugs = new Set(existingDestProfiles.map((profile) => profile.slug));

      const sourceCAsRaw = await certificateAuthorityDAL.findWithAssociatedCa(
        { projectId: sourceProjectId },
        undefined,
        undefined,
        tx
      );
      const sourceInternalCAs = sourceCAsRaw.filter((ca) => Boolean(ca.internalCa?.id));

      const allSourceSecrets = sourceInternalCAs.length
        ? await certificateAuthoritySecretDAL.find({ $in: { caId: sourceInternalCAs.map((ca) => ca.id) } }, { tx })
        : [];
      const sourceSecretsByCaId = new Map<string, typeof allSourceSecrets>();
      for (const secret of allSourceSecrets) {
        const existing = sourceSecretsByCaId.get(secret.caId);
        if (existing) existing.push(secret);
        else sourceSecretsByCaId.set(secret.caId, [secret]);
      }

      const hsmBackedCaIds = new Set(
        allSourceSecrets.filter((s) => s.keySource === CertKeySource.Hsm).map((s) => s.caId)
      );
      if (hsmBackedCaIds.size) {
        const names = sourceInternalCAs
          .filter((ca) => hsmBackedCaIds.has(ca.id))
          .map((ca) => ca.name)
          .join(", ");
        throw new BadRequestError({
          message: `Cannot export HSM-backed certificate authorities (${names}); their signing keys are bound to a project-scoped HSM connector. Remove them from the source project before exporting.`
        });
      }

      const caIndexById = new Map(sourceInternalCAs.map((ca) => [ca.id, ca]));
      const visited = new Set<string>();
      const sortedCAs: typeof sourceInternalCAs = [];
      const visit = (ca: (typeof sourceInternalCAs)[number]) => {
        if (visited.has(ca.id)) return;
        const parentId = ca.internalCa?.parentCaId;
        if (parentId) {
          const parent = caIndexById.get(parentId);
          if (parent) visit(parent);
        }
        visited.add(ca.id);
        sortedCAs.push(ca);
      };
      for (const ca of sourceInternalCAs) visit(ca);

      const caIdMap = new Map<string, string>();
      const caSecretIdMap = new Map<string, string>();
      const caCertIdMap = new Map<string, string>();
      const renamedCertificateAuthorities: { originalName: string; newName: string }[] = [];

      for (const sourceCa of sortedCAs) {
        const newName = allocateUniqueName(sourceCa.name, destCaNames);
        if (newName !== sourceCa.name) {
          renamedCertificateAuthorities.push({ originalName: sourceCa.name, newName });
        }
        destCaNames.add(newName);

        const newCa = await certificateAuthorityDAL.create(
          {
            projectId: destinationProjectId,
            name: newName,
            status: sourceCa.status,
            enableDirectIssuance: sourceCa.enableDirectIssuance
          },
          tx
        );
        caIdMap.set(sourceCa.id, newCa.id);

        const sourceSecrets = sourceSecretsByCaId.get(sourceCa.id) ?? [];
        for (const sourceSecret of sourceSecrets) {
          const newSecret = await certificateAuthoritySecretDAL.create(
            {
              caId: newCa.id,
              keySource: sourceSecret.keySource,
              hsmConnectorId: sourceSecret.hsmConnectorId,
              hsmKeyLabel: sourceSecret.hsmKeyLabel,
              hsmPublicKeySpki: sourceSecret.hsmPublicKeySpki,
              encryptedPrivateKey: sourceSecret.encryptedPrivateKey
                ? await reencrypt(sourceSecret.encryptedPrivateKey)
                : undefined
            },
            tx
          );
          caSecretIdMap.set(sourceSecret.id, newSecret.id);
        }

        const sourceCaCerts = await certificateAuthorityCertDAL.find({ caId: sourceCa.id }, { tx });
        for (const sourceCaCert of sourceCaCerts) {
          const newSecretId = caSecretIdMap.get(sourceCaCert.caSecretId);
          if (!newSecretId) {
            throw new InternalServerError({
              message: `CA secret referenced by certificate authority cert '${sourceCaCert.id}' was not exported`
            });
          }
          const newCaCert = await certificateAuthorityCertDAL.create(
            {
              caId: newCa.id,
              caSecretId: newSecretId,
              version: sourceCaCert.version,
              encryptedCertificate: await reencrypt(sourceCaCert.encryptedCertificate),
              encryptedCertificateChain: await reencrypt(sourceCaCert.encryptedCertificateChain)
            },
            tx
          );
          caCertIdMap.set(sourceCaCert.id, newCaCert.id);
        }

        const internalCa = sourceCa.internalCa!;
        const newActiveCaCertId = internalCa.activeCaCertId
          ? (caCertIdMap.get(internalCa.activeCaCertId) ?? null)
          : null;
        const newParentCaId = internalCa.parentCaId ? (caIdMap.get(internalCa.parentCaId) ?? null) : null;

        await internalCertificateAuthorityDAL.create(
          {
            caId: newCa.id,
            parentCaId: newParentCaId,
            type: internalCa.type,
            friendlyName: internalCa.friendlyName,
            organization: internalCa.organization,
            ou: internalCa.ou,
            country: internalCa.country,
            province: internalCa.province,
            locality: internalCa.locality,
            commonName: internalCa.commonName,
            dn: internalCa.dn,
            serialNumber: internalCa.serialNumber ?? null,
            maxPathLength: internalCa.maxPathLength ?? null,
            keyAlgorithm: internalCa.keyAlgorithm,
            notBefore: internalCa.notBefore ? new Date(internalCa.notBefore) : null,
            notAfter: internalCa.notAfter ? new Date(internalCa.notAfter) : null,
            activeCaCertId: newActiveCaCertId,
            crlDistributionPointUrls: internalCa.crlDistributionPointUrls ?? []
          },
          tx
        );

        const sourceCrl = await certificateAuthorityCrlDAL.findOne({ caId: sourceCa.id }, tx);
        if (sourceCrl) {
          const newCrlSecretId = caSecretIdMap.get(sourceCrl.caSecretId);
          if (!newCrlSecretId) {
            throw new InternalServerError({
              message: `CA secret referenced by CRL '${sourceCrl.id}' was not exported`
            });
          }
          await certificateAuthorityCrlDAL.create(
            {
              caId: newCa.id,
              caSecretId: newCrlSecretId,
              encryptedCrl: await reencrypt(sourceCrl.encryptedCrl)
            },
            tx
          );
        }
      }

      const sourcePolicies = await certificatePolicyDAL.find({ projectId: sourceProjectId }, { tx });
      const policyIdMap = new Map<string, string>();
      const renamedCertificatePolicies: { originalName: string; newName: string }[] = [];

      for (const sourcePolicy of sourcePolicies) {
        const newName = allocateUniqueName(sourcePolicy.name, destPolicyNames);
        if (newName !== sourcePolicy.name) {
          renamedCertificatePolicies.push({ originalName: sourcePolicy.name, newName });
        }
        destPolicyNames.add(newName);

        const [insertedPolicy] = await tx(TableName.PkiCertificatePolicy)
          .insert({
            projectId: destinationProjectId,
            name: newName,
            description: sourcePolicy.description ?? null,
            subject: toJsonbValue(sourcePolicy.subject),
            sans: toJsonbValue(sourcePolicy.sans),
            keyUsages: toJsonbValue(sourcePolicy.keyUsages),
            extendedKeyUsages: toJsonbValue(sourcePolicy.extendedKeyUsages),
            algorithms: toJsonbValue(sourcePolicy.algorithms),
            validity: toJsonbValue(sourcePolicy.validity),
            basicConstraints: toJsonbValue(sourcePolicy.basicConstraints)
          })
          .returning("id");
        policyIdMap.set(sourcePolicy.id, insertedPolicy.id);
      }

      const sourceProfiles = await certificateProfileDAL.find({ projectId: sourceProjectId }, { tx });
      const renamedCertificateProfiles: { originalSlug: string; newSlug: string }[] = [];
      let exportedCertificateProfiles = 0;
      let skippedCertificateProfiles = 0;

      for (const sourceProfile of sourceProfiles) {
        let newCaId: string | null = null;
        if (sourceProfile.issuerType === IssuerType.SELF_SIGNED) {
          newCaId = null;
        } else if (sourceProfile.caId && caIdMap.has(sourceProfile.caId)) {
          newCaId = caIdMap.get(sourceProfile.caId) ?? null;
        } else {
          skippedCertificateProfiles += 1;
          // eslint-disable-next-line no-continue
          continue;
        }

        const newPolicyId = policyIdMap.get(sourceProfile.certificatePolicyId);
        if (!newPolicyId) {
          skippedCertificateProfiles += 1;
          // eslint-disable-next-line no-continue
          continue;
        }

        const newSlug = allocateUniqueName(sourceProfile.slug, destProfileSlugs);
        if (newSlug !== sourceProfile.slug) {
          renamedCertificateProfiles.push({ originalSlug: sourceProfile.slug, newSlug });
        }
        destProfileSlugs.add(newSlug);

        await tx(TableName.PkiCertificateProfile).insert({
          projectId: destinationProjectId,
          caId: newCaId,
          certificatePolicyId: newPolicyId,
          slug: newSlug,
          description: sourceProfile.description ?? null,
          enrollmentType: sourceProfile.enrollmentType,
          issuerType: sourceProfile.issuerType,
          defaults: toJsonbValue(sourceProfile.defaults),
          externalConfigs: sourceProfile.externalConfigs ?? null,
          estConfigId: null,
          apiConfigId: null,
          acmeConfigId: null,
          scepConfigId: null
        });
        exportedCertificateProfiles += 1;
      }

      return {
        sourceProjectId,
        destinationProjectId,
        exportedCertificateAuthorities: sortedCAs.length,
        renamedCertificateAuthorities,
        exportedCertificatePolicies: sourcePolicies.length,
        renamedCertificatePolicies,
        exportedCertificateProfiles,
        skippedCertificateProfiles,
        renamedCertificateProfiles
      };
    });
  };

  return { exportCertManagerProject };
};
