import { ForbiddenError, subject } from "@casl/ability";

import { ActionProjectType, TPamDomains } from "@app/db/schemas";
import { ProjectPermissionActions, ProjectPermissionSub } from "@app/ee/services/permission/project-permission";
import { DatabaseErrorCode } from "@app/lib/error-codes";
import { BadRequestError, DatabaseError, NotFoundError } from "@app/lib/errors";
import { OrgServiceActor } from "@app/lib/types";

import { decryptAccountCredentials } from "../pam-account/pam-account-fns";
import { decryptResourceConnectionDetails } from "../pam-resource/pam-resource-fns";
import { TWindowsResource } from "../pam-resource/windows-server/windows-server-resource-types";
import { PamDomainType } from "./pam-domain-enums";
import { PAM_DOMAIN_FACTORY_MAP } from "./pam-domain-factory";
import { decryptDomainConnectionDetails, encryptDomainConnectionDetails } from "./pam-domain-fns";
import {
  TCreateDomainDTO,
  TListDomainsDTO,
  TPamDomain,
  TPamDomainServiceFactoryDep,
  TUpdateDomainDTO
} from "./pam-domain-types";

export type TPamDomainServiceFactory = ReturnType<typeof pamDomainServiceFactory>;

const decryptDomain = async (
  domain: TPamDomains,
  projectId: string,
  kmsService: TPamDomainServiceFactoryDep["kmsService"]
): Promise<TPamDomain> => {
  const connectionDetails = await decryptDomainConnectionDetails({
    encryptedConnectionDetails: domain.encryptedConnectionDetails,
    projectId,
    kmsService
  });

  return {
    ...domain,
    domainType: domain.domainType as PamDomainType,
    connectionDetails
  } as TPamDomain;
};

export const pamDomainServiceFactory = ({
  pamDomainDAL,
  pamResourceDAL,
  permissionService,
  kmsService,
  gatewayV2Service,
  resourceMetadataDAL
}: TPamDomainServiceFactoryDep) => {
  const getById = async (id: string, domainType: PamDomainType, actor: OrgServiceActor) => {
    const domain = await pamDomainDAL.findById(id);
    if (!domain) throw new NotFoundError({ message: `Domain with ID '${id}' not found` });

    const { permission } = await permissionService.getProjectPermission({
      actor: actor.type,
      actorAuthMethod: actor.authMethod,
      actorId: actor.id,
      actorOrgId: actor.orgId,
      projectId: domain.projectId,
      actionProjectType: ActionProjectType.PAM
    });

    const metadataByDomainId = await pamDomainDAL.findMetadataByDomainIds([domain.id]);
    const domainMetadata = metadataByDomainId[domain.id] || [];

    ForbiddenError.from(permission).throwUnlessCan(
      ProjectPermissionActions.Read,
      subject(ProjectPermissionSub.PamDomains, {
        name: domain.name,
        domainType: domain.domainType,
        metadata: domainMetadata
      })
    );

    if (domain.domainType !== domainType) {
      throw new BadRequestError({
        message: `Domain with ID '${id}' is not of type '${domainType}'`
      });
    }

    return {
      ...(await decryptDomain(domain, domain.projectId, kmsService)),
      metadata: domainMetadata
    };
  };

  const create = async (
    { domainType, connectionDetails, gatewayId, name, projectId, metadata }: TCreateDomainDTO,
    actor: OrgServiceActor
  ) => {
    const { permission } = await permissionService.getProjectPermission({
      actor: actor.type,
      actorAuthMethod: actor.authMethod,
      actorId: actor.id,
      actorOrgId: actor.orgId,
      projectId,
      actionProjectType: ActionProjectType.PAM
    });

    ForbiddenError.from(permission).throwUnlessCan(
      ProjectPermissionActions.Create,
      subject(ProjectPermissionSub.PamDomains, {
        name,
        domainType,
        metadata: (metadata || []).map(({ key, value }) => ({ key, value: value ?? "" }))
      })
    );

    const factory = PAM_DOMAIN_FACTORY_MAP[domainType](
      domainType,
      connectionDetails,
      gatewayId,
      gatewayV2Service,
      projectId
    );

    const validatedConnectionDetails = await factory.validateConnection();
    const encryptedConnectionDetails = await encryptDomainConnectionDetails({
      connectionDetails: validatedConnectionDetails,
      projectId,
      kmsService
    });

    try {
      const { domain: newDomain, insertedMetadata } = await pamDomainDAL.transaction(async (tx) => {
        const created = await pamDomainDAL.create(
          {
            domainType,
            encryptedConnectionDetails,
            gatewayId,
            name,
            projectId
          },
          tx
        );
        let metadataRows: Awaited<ReturnType<typeof resourceMetadataDAL.insertMany>> | undefined;
        if (metadata && metadata.length > 0) {
          metadataRows = await resourceMetadataDAL.insertMany(
            metadata.map(({ key, value }) => ({
              key,
              value: value ?? "",
              pamDomainId: created.id,
              orgId: actor.orgId
            })),
            tx
          );
        }
        return { domain: created, insertedMetadata: metadataRows };
      });

      return {
        ...(await decryptDomain(newDomain, projectId, kmsService)),
        metadata: insertedMetadata?.map(({ id, key, value }) => ({ id, key, value: value ?? "" })) ?? []
      };
    } catch (err) {
      if (err instanceof DatabaseError && (err.error as { code: string })?.code === DatabaseErrorCode.UniqueViolation) {
        throw new BadRequestError({
          message: `Domain with name '${name}' already exists in this project`
        });
      }
      throw err;
    }
  };

  const updateById = async (
    { domainId, connectionDetails, name, gatewayId, metadata }: TUpdateDomainDTO,
    actor: OrgServiceActor
  ) => {
    const domain = await pamDomainDAL.findById(domainId);
    if (!domain) throw new NotFoundError({ message: `Domain with ID '${domainId}' not found` });

    const { permission } = await permissionService.getProjectPermission({
      actor: actor.type,
      actorAuthMethod: actor.authMethod,
      actorId: actor.id,
      actorOrgId: actor.orgId,
      projectId: domain.projectId,
      actionProjectType: ActionProjectType.PAM
    });

    const existingMetadata = await pamDomainDAL.findMetadataByDomainIds([domainId]);
    const currentMetadata = existingMetadata[domainId] || [];

    ForbiddenError.from(permission).throwUnlessCan(
      ProjectPermissionActions.Edit,
      subject(ProjectPermissionSub.PamDomains, {
        name: domain.name,
        domainType: domain.domainType,
        metadata: currentMetadata
      })
    );

    if (metadata || name) {
      ForbiddenError.from(permission).throwUnlessCan(
        ProjectPermissionActions.Edit,
        subject(ProjectPermissionSub.PamDomains, {
          name: name ?? domain.name,
          domainType: domain.domainType,
          metadata: metadata ? metadata.map(({ key, value }) => ({ key, value: value ?? "" })) : currentMetadata
        })
      );
    }

    const updateDoc: Partial<TPamDomains> = {};
    const effectiveGatewayId = gatewayId !== undefined ? gatewayId : domain.gatewayId;

    if (gatewayId !== undefined) {
      updateDoc.gatewayId = gatewayId;
    }

    if (name !== undefined) {
      updateDoc.name = name;
    }

    if (connectionDetails !== undefined) {
      const factory = PAM_DOMAIN_FACTORY_MAP[domain.domainType as PamDomainType](
        domain.domainType as PamDomainType,
        connectionDetails,
        effectiveGatewayId,
        gatewayV2Service,
        domain.projectId
      );
      const validatedConnectionDetails = await factory.validateConnection();
      const encryptedConnectionDetails = await encryptDomainConnectionDetails({
        connectionDetails: validatedConnectionDetails,
        projectId: domain.projectId,
        kmsService
      });
      updateDoc.encryptedConnectionDetails = encryptedConnectionDetails;
    }

    if (Object.keys(updateDoc).length === 0 && metadata === undefined) {
      const existingMeta = await pamDomainDAL.findMetadataByDomainIds([domainId]);
      return {
        ...(await decryptDomain(domain, domain.projectId, kmsService)),
        metadata: existingMeta[domainId] || []
      };
    }

    try {
      const updatedDomain = await pamDomainDAL.transaction(async (tx) => {
        if (metadata) {
          await resourceMetadataDAL.delete({ pamDomainId: domainId }, tx);
          if (metadata.length > 0) {
            await resourceMetadataDAL.insertMany(
              metadata.map(({ key, value }) => ({
                key,
                value: value ?? "",
                pamDomainId: domainId,
                orgId: actor.orgId
              })),
              tx
            );
          }
        }
        if (Object.keys(updateDoc).length > 0) {
          return pamDomainDAL.updateById(domainId, updateDoc, tx);
        }
        return domain;
      });

      const freshMeta = await pamDomainDAL.findMetadataByDomainIds([domainId]);

      return {
        ...(await decryptDomain(updatedDomain, domain.projectId, kmsService)),
        metadata: freshMeta[domainId] || []
      };
    } catch (err) {
      if (err instanceof DatabaseError && (err.error as { code: string })?.code === DatabaseErrorCode.UniqueViolation) {
        throw new BadRequestError({
          message: `Domain with name '${name}' already exists in this project`
        });
      }
      throw err;
    }
  };

  const deleteById = async (id: string, actor: OrgServiceActor) => {
    const domain = await pamDomainDAL.findById(id);
    if (!domain) throw new NotFoundError({ message: `Domain with ID '${id}' not found` });

    const { permission } = await permissionService.getProjectPermission({
      actor: actor.type,
      actorAuthMethod: actor.authMethod,
      actorId: actor.id,
      actorOrgId: actor.orgId,
      projectId: domain.projectId,
      actionProjectType: ActionProjectType.PAM
    });

    const metadataByDomainId = await pamDomainDAL.findMetadataByDomainIds([id]);

    ForbiddenError.from(permission).throwUnlessCan(
      ProjectPermissionActions.Delete,
      subject(ProjectPermissionSub.PamDomains, {
        name: domain.name,
        domainType: domain.domainType,
        metadata: metadataByDomainId[id] || []
      })
    );

    try {
      const deletedDomain = await pamDomainDAL.deleteById(id);
      return await decryptDomain(deletedDomain, domain.projectId, kmsService);
    } catch (err) {
      if (
        err instanceof DatabaseError &&
        (err.error as { code: string })?.code === DatabaseErrorCode.ForeignKeyViolation
      ) {
        throw new BadRequestError({
          message: "Failed to delete domain because it is attached to active PAM accounts or resources"
        });
      }
      throw err;
    }
  };

  const list = async ({ projectId, actor, actorId, actorAuthMethod, actorOrgId, ...params }: TListDomainsDTO) => {
    const { permission } = await permissionService.getProjectPermission({
      actor,
      actorId,
      actorAuthMethod,
      actorOrgId,
      projectId,
      actionProjectType: ActionProjectType.PAM
    });

    ForbiddenError.from(permission).throwUnlessCan(ProjectPermissionActions.Read, ProjectPermissionSub.PamDomains);

    const { domains, totalCount } = await pamDomainDAL.findByProjectId({
      projectId,
      ...params
    });

    const domainIds = domains.map((d) => d.id);
    const metadataByDomainId = await pamDomainDAL.findMetadataByDomainIds(domainIds);

    return {
      domains: await Promise.all(
        domains.map(async (d) => ({
          ...(await decryptDomain(d, projectId, kmsService)),
          metadata: metadataByDomainId[d.id] || []
        }))
      ),
      totalCount
    };
  };

  const listRelatedResources = async (domainId: string, actor: OrgServiceActor) => {
    const domain = await pamDomainDAL.findById(domainId);
    if (!domain) throw new NotFoundError({ message: `Domain with ID '${domainId}' not found` });

    const { permission } = await permissionService.getProjectPermission({
      actor: actor.type,
      actorAuthMethod: actor.authMethod,
      actorId: actor.id,
      actorOrgId: actor.orgId,
      projectId: domain.projectId,
      actionProjectType: ActionProjectType.PAM
    });

    const metadataByDomainId = await pamDomainDAL.findMetadataByDomainIds([domainId]);

    ForbiddenError.from(permission).throwUnlessCan(
      ProjectPermissionActions.Read,
      subject(ProjectPermissionSub.PamDomains, {
        name: domain.name,
        domainType: domain.domainType,
        metadata: metadataByDomainId[domainId] || []
      })
    );

    const relatedResources = await pamResourceDAL.find({ domainId });

    return Promise.all(
      relatedResources.map(async (r) => {
        const rConnectionDetails = await decryptResourceConnectionDetails({
          encryptedConnectionDetails: r.encryptedConnectionDetails,
          projectId: domain.projectId,
          kmsService
        });
        const rotationAccountCredentials = r.encryptedRotationAccountCredentials
          ? await decryptAccountCredentials({
              encryptedCredentials: r.encryptedRotationAccountCredentials,
              projectId: domain.projectId,
              kmsService
            })
          : null;
        return { ...r, connectionDetails: rConnectionDetails, rotationAccountCredentials } as TWindowsResource;
      })
    );
  };

  const listDomainOptions = () => {
    return [{ name: "Active Directory" as const, domain: PamDomainType.ActiveDirectory }].sort((a, b) =>
      a.name.localeCompare(b.name)
    );
  };

  return {
    getById,
    create,
    updateById,
    deleteById,
    list,
    listRelatedResources,
    listDomainOptions
  };
};
