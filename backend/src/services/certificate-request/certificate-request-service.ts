import { ForbiddenError, subject } from "@casl/ability";
import { Knex } from "knex";
import { z } from "zod";

import { ActionProjectType, ResourceType } from "@app/db/schemas";
import { TPermissionServiceFactory } from "@app/ee/services/permission/permission-service-types";
import {
  ProjectPermissionCertificateActions,
  ProjectPermissionCertificateProfileActions,
  ProjectPermissionSub
} from "@app/ee/services/permission/project-permission";
import {
  ResourcePermissionCertificateActions,
  ResourcePermissionSub
} from "@app/ee/services/permission/resource-permission";
import { getProcessedPermissionRules } from "@app/lib/casl/permission-filter-utils";
import { BadRequestError, NotFoundError } from "@app/lib/errors";
import { logger } from "@app/lib/logger";
import { QueueName, TQueueServiceFactory } from "@app/queue";
import { TCertificateDALFactory } from "@app/services/certificate/certificate-dal";
import { TCertificateServiceFactory } from "@app/services/certificate/certificate-service";

import { ActorAuthMethod, ActorType } from "../auth/auth-type";
import { TIdentityDALFactory } from "../identity/identity-dal";
import { TResourceMetadataDALFactory } from "../resource-metadata/resource-metadata-dal";
import { TUserDALFactory } from "../user/user-dal";
import { TCertificateRequestDALFactory } from "./certificate-request-dal";
import {
  CertificateRequestStatus,
  TAttachCertificateToRequestDTO,
  TCreateCertificateRequestDTO,
  TGetCertificateFromRequestDTO,
  TGetCertificateRequestDTO,
  TListCertificateRequestsDTO,
  TUpdateCertificateRequestStatusDTO
} from "./certificate-request-types";

type TCertificateRequestServiceFactoryDep = {
  certificateRequestDAL: TCertificateRequestDALFactory;
  certificateDAL: Pick<TCertificateDALFactory, "findById">;
  certificateService: Pick<TCertificateServiceFactory, "getCertBody" | "getCertPrivateKey">;
  permissionService: Pick<TPermissionServiceFactory, "getProjectPermission" | "getResourcePermission">;
  resourceMetadataDAL: Pick<TResourceMetadataDALFactory, "find" | "insertMany">;
  queueService: Pick<TQueueServiceFactory, "stopJobById" | "cancelActiveJob">;
  userDAL: Pick<TUserDALFactory, "findById">;
  identityDAL: Pick<TIdentityDALFactory, "findById">;
};

export type TCertificateRequestServiceFactory = ReturnType<typeof certificateRequestServiceFactory>;

const subjectAlternativeNameSchema = z.object({
  type: z.string().max(50),
  value: z.string().max(500)
});

const certificateRequestDataSchema = z
  .object({
    profileId: z.string().uuid().optional(),
    applicationId: z.string().uuid().optional(),
    caId: z.string().uuid().optional(),
    csr: z.string().min(1).optional(),
    commonName: z.string().max(255).optional(),
    altNames: z.array(subjectAlternativeNameSchema).max(100).optional(),
    keyUsages: z.array(z.string()).max(20).optional(),
    extendedKeyUsages: z.array(z.string()).max(20).optional(),
    notBefore: z.date().optional(),
    notAfter: z.date().optional(),
    keyAlgorithm: z.string().max(100).optional(),
    signatureAlgorithm: z.string().max(100).optional(),
    metadata: z.string().max(2000).optional(),
    certificateId: z.string().optional(),
    basicConstraints: z
      .object({
        isCA: z.boolean(),
        pathLength: z.number().int().min(-1).optional()
      })
      .optional(),
    ttl: z.string().max(50).optional(),
    enrollmentType: z.string().max(50).optional(),
    organization: z.string().max(255).optional(),
    organizationalUnit: z.string().max(255).optional(),
    country: z.string().max(100).optional(),
    state: z.string().max(255).optional(),
    locality: z.string().max(255).optional(),
    domainComponents: z.array(z.string().max(255)).max(50).optional()
  })
  .refine(
    (data) => {
      // Must have either profileId or caId
      return data.profileId || data.caId;
    },
    {
      message: "Either profileId or caId must be provided"
    }
  )
  .refine(
    (data) => {
      // If notAfter is provided, it must be after notBefore
      if (data.notBefore && data.notAfter) {
        return data.notAfter > data.notBefore;
      }
      return true;
    },
    {
      message: "notAfter must be after notBefore"
    }
  )
  .refine(
    (data) => {
      // pathLength should only be set when isCA is true
      if (data.basicConstraints?.pathLength !== undefined && !data.basicConstraints?.isCA) {
        return false;
      }
      return true;
    },
    {
      message: "pathLength can only be set when isCA is true"
    }
  );

const validateCertificateRequestData = (data: unknown) => {
  try {
    return certificateRequestDataSchema.parse(data);
  } catch (error) {
    if (error instanceof z.ZodError) {
      throw new BadRequestError({
        message: `Invalid certificate request data: ${error.errors.map((e) => e.message).join(", ")}`
      });
    }
    throw error;
  }
};

export const certificateRequestServiceFactory = ({
  certificateRequestDAL,
  certificateDAL,
  certificateService,
  permissionService,
  resourceMetadataDAL,
  queueService,
  userDAL,
  identityDAL
}: TCertificateRequestServiceFactoryDep) => {
  const createCertificateRequest = async ({
    acmeOrderId,
    actor,
    actorId,
    actorAuthMethod,
    actorOrgId,
    projectId,
    tx,
    status,
    internal = false,
    ...requestData
  }: TCreateCertificateRequestDTO & { tx?: Knex }) => {
    if (
      !internal &&
      actor !== ActorType.ACME_ACCOUNT &&
      actor !== ActorType.PLATFORM &&
      actor !== ActorType.EST_ACCOUNT &&
      actor !== ActorType.SCEP_ACCOUNT
    ) {
      const { permission } = await permissionService.getProjectPermission({
        actor,
        actorId,
        projectId,
        actorAuthMethod,
        actorOrgId,
        actionProjectType: ActionProjectType.CertificateManager
      });

      ForbiddenError.from(permission).throwUnlessCan(
        ProjectPermissionCertificateProfileActions.IssueCert,
        ProjectPermissionSub.CertificateProfiles
      );
    }

    // Validate input data before creating the request
    const validatedData = validateCertificateRequestData(requestData);

    const { altNames: altNamesInput, domainComponents: domainComponentsInput, ...restValidatedData } = validatedData;

    // Explicitly set createdAt to ensure millisecond precision matches when used in FK references.
    // PostgreSQL's DEFAULT now() has microsecond precision, but JavaScript Date only has millisecond precision.
    // This mismatch causes FK violations when the returned createdAt is used in composite FK references
    // (e.g., resource_metadata referencing the partitioned certificate_requests table).
    const certificateRequest = await certificateRequestDAL.create(
      {
        status,
        projectId,
        acmeOrderId,
        ...restValidatedData,
        altNames: altNamesInput ? JSON.stringify(altNamesInput) : null,
        domainComponents:
          domainComponentsInput && domainComponentsInput.length > 0 ? domainComponentsInput.join(",") : null,
        createdAt: new Date()
      } as Parameters<typeof certificateRequestDAL.create>[0] & { createdAt: Date },
      tx
    );

    return certificateRequest;
  };

  const getCertificateRequest = async ({
    actor,
    actorId,
    actorAuthMethod,
    actorOrgId,
    projectId,
    certificateRequestId
  }: TGetCertificateRequestDTO) => {
    const certificateRequest = await certificateRequestDAL.findById(certificateRequestId);
    if (!certificateRequest) {
      throw new NotFoundError({ message: "Certificate request not found" });
    }

    if (certificateRequest.projectId !== projectId) {
      throw new NotFoundError({ message: "Certificate request not found" });
    }

    const { permission } = await permissionService.getProjectPermission({
      actor,
      actorId,
      projectId,
      actorAuthMethod,
      actorOrgId,
      actionProjectType: ActionProjectType.CertificateManager
    });

    const metadataRows = await resourceMetadataDAL.find({ certificateRequestId: certificateRequest.id });
    const requestMetadata = metadataRows.map(({ key, value }) => ({ key, value: value || "" }));

    const certSubject = subject(ProjectPermissionSub.Certificates, {
      commonName: certificateRequest.commonName ?? undefined,
      altNames: Array.isArray(certificateRequest.altNames)
        ? (certificateRequest.altNames as { type: string; value: string }[]).map((san) => san.value)
        : undefined,
      metadata: requestMetadata
    });

    if (!permission.can(ProjectPermissionCertificateActions.Read, certSubject)) {
      let allowedByResource = false;
      if (certificateRequest.applicationId) {
        const { permission: resourcePermission } = await permissionService.getResourcePermission({
          actor,
          actorId,
          projectId,
          resourceType: ResourceType.CertificateApplication,
          resourceId: certificateRequest.applicationId,
          actorAuthMethod,
          actorOrgId
        });
        allowedByResource = resourcePermission.can(
          ResourcePermissionCertificateActions.Read,
          ResourcePermissionSub.Certificates
        );
      }
      if (!allowedByResource) {
        ForbiddenError.from(permission).throwUnlessCan(ProjectPermissionCertificateActions.Read, certSubject);
      }
    }

    return certificateRequest;
  };

  const getCertificateFromRequest = async ({
    actor,
    actorId,
    actorAuthMethod,
    actorOrgId,
    certificateRequestId
  }: TGetCertificateFromRequestDTO) => {
    const certificateRequest = await certificateRequestDAL.findByIdWithCertificate(certificateRequestId);
    if (!certificateRequest) {
      throw new NotFoundError({ message: "Certificate request not found" });
    }

    const { permission } = await permissionService.getProjectPermission({
      actor,
      actorId,
      projectId: certificateRequest.projectId,
      actorAuthMethod,
      actorOrgId,
      actionProjectType: ActionProjectType.CertificateManager
    });

    const metadataRows = await resourceMetadataDAL.find({ certificateRequestId: certificateRequest.id });
    const requestMetadata = metadataRows.map(({ key, value }) => ({ key, value: value || "" }));

    const certFromRequestSubject = subject(ProjectPermissionSub.Certificates, {
      commonName: certificateRequest.commonName ?? undefined,
      altNames: Array.isArray(certificateRequest.altNames)
        ? (certificateRequest.altNames as { type: string; value: string }[]).map((san) => san.value)
        : undefined,
      metadata: requestMetadata
    });

    if (!permission.can(ProjectPermissionCertificateActions.Read, certFromRequestSubject)) {
      let allowedByResource = false;
      if (certificateRequest.applicationId) {
        const { permission: resourcePermission } = await permissionService.getResourcePermission({
          actor,
          actorId,
          projectId: certificateRequest.projectId,
          resourceType: ResourceType.CertificateApplication,
          resourceId: certificateRequest.applicationId,
          actorAuthMethod,
          actorOrgId
        });
        allowedByResource = resourcePermission.can(
          ResourcePermissionCertificateActions.Read,
          ResourcePermissionSub.Certificates
        );
      }
      if (!allowedByResource) {
        ForbiddenError.from(permission).throwUnlessCan(
          ProjectPermissionCertificateActions.Read,
          certFromRequestSubject
        );
      }
    }

    const parsedBasicConstraints = certificateRequest.basicConstraints as {
      isCA: boolean;
      pathLength?: number;
    } | null;

    // If no certificate is attached, return basic info
    if (!certificateRequest.certificate) {
      return {
        certificateRequest: {
          status: certificateRequest.status as CertificateRequestStatus,
          certificate: null,
          certificateId: null,
          privateKey: null,
          serialNumber: null,
          errorMessage: certificateRequest.errorMessage || null,
          pendingMessage: certificateRequest.pendingMessage || null,
          commonName: certificateRequest.commonName || null,
          organization: certificateRequest.organization || null,
          organizationalUnit: certificateRequest.organizationalUnit || null,
          country: certificateRequest.country || null,
          state: certificateRequest.state || null,
          locality: certificateRequest.locality || null,
          domainComponents: certificateRequest.domainComponents ? certificateRequest.domainComponents.split(",") : null,
          basicConstraints: parsedBasicConstraints,
          metadata: requestMetadata,
          createdAt: certificateRequest.createdAt,
          updatedAt: certificateRequest.updatedAt
        },
        projectId: certificateRequest.projectId
      };
    }

    // Get certificate body (PEM data)
    const certBody = await certificateService.getCertBody({
      id: certificateRequest.certificate.id,
      actor,
      actorId,
      actorAuthMethod,
      actorOrgId
    });

    let canReadPrivateKey: boolean;
    if (certificateRequest.applicationId) {
      const { permission: resourcePermission } = await permissionService.getResourcePermission({
        actor,
        actorId,
        projectId: certificateRequest.projectId,
        resourceType: ResourceType.CertificateApplication,
        resourceId: certificateRequest.applicationId,
        actorAuthMethod,
        actorOrgId
      });
      canReadPrivateKey = resourcePermission.can(
        ResourcePermissionCertificateActions.ReadPrivateKey,
        ResourcePermissionSub.Certificates
      );
    } else {
      canReadPrivateKey = permission.can(
        ProjectPermissionCertificateActions.ReadPrivateKey,
        subject(ProjectPermissionSub.Certificates, {
          commonName: certificateRequest.commonName ?? undefined,
          altNames: Array.isArray(certificateRequest.altNames)
            ? (certificateRequest.altNames as { type: string; value: string }[]).map((san) => san.value)
            : undefined,
          metadata: requestMetadata
        })
      );
    }

    let privateKey: string | null = null;
    if (canReadPrivateKey) {
      try {
        const certPrivateKey = await certificateService.getCertPrivateKey({
          id: certificateRequest.certificate.id,
          actor,
          actorId,
          actorAuthMethod,
          actorOrgId
        });
        privateKey = certPrivateKey.certPrivateKey;
      } catch (error) {
        privateKey = null;
      }
    }

    return {
      certificateRequest: {
        status: certificateRequest.status as CertificateRequestStatus,
        certificate: certBody.certificate,
        certificateId: certificateRequest.certificate.id,
        privateKey,
        serialNumber: certificateRequest.certificate.serialNumber,
        errorMessage: certificateRequest.errorMessage || null,
        pendingMessage: certificateRequest.pendingMessage || null,
        commonName: certificateRequest.commonName || null,
        organization: certificateRequest.organization || null,
        organizationalUnit: certificateRequest.organizationalUnit || null,
        country: certificateRequest.country || null,
        state: certificateRequest.state || null,
        locality: certificateRequest.locality || null,
        domainComponents: certificateRequest.domainComponents ? certificateRequest.domainComponents.split(",") : null,
        basicConstraints: parsedBasicConstraints,
        metadata: requestMetadata,
        createdAt: certificateRequest.createdAt,
        updatedAt: certificateRequest.updatedAt
      },
      projectId: certificateRequest.projectId
    };
  };

  const updateCertificateRequestStatus = async ({
    certificateRequestId,
    status,
    errorMessage
  }: TUpdateCertificateRequestStatusDTO) => {
    const certificateRequest = await certificateRequestDAL.findById(certificateRequestId);
    if (!certificateRequest) {
      throw new NotFoundError({ message: "Certificate request not found" });
    }

    return certificateRequestDAL.transitionFromPending(certificateRequestId, status, errorMessage);
  };

  const attachCertificateToRequest = async ({
    certificateRequestId,
    certificateId
  }: TAttachCertificateToRequestDTO) => {
    const certificateRequest = await certificateRequestDAL.findById(certificateRequestId);
    if (!certificateRequest) {
      throw new NotFoundError({ message: "Certificate request not found" });
    }

    const certificate = await certificateDAL.findById(certificateId);
    if (!certificate) {
      throw new NotFoundError({ message: "Certificate not found" });
    }

    return certificateRequestDAL.attachCertificate(certificateRequestId, certificateId);
  };

  const listCertificateRequests = async ({
    actor,
    actorId,
    actorAuthMethod,
    actorOrgId,
    projectId,
    offset = 0,
    limit = 20,
    search,
    status,
    fromDate,
    toDate,
    profileIds,
    applicationId,
    sortBy,
    sortOrder,
    metadataFilter
  }: TListCertificateRequestsDTO) => {
    let processedRules: ReturnType<typeof getProcessedPermissionRules> | undefined;
    let allowedByResource = false;

    if (applicationId && (actor === ActorType.USER || actor === ActorType.IDENTITY)) {
      const { permission: resourcePermission } = await permissionService.getResourcePermission({
        actor,
        actorId,
        projectId,
        resourceType: ResourceType.CertificateApplication,
        resourceId: applicationId,
        actorAuthMethod,
        actorOrgId
      });
      if (resourcePermission.can(ResourcePermissionCertificateActions.Read, ResourcePermissionSub.Certificates)) {
        allowedByResource = true;
      }
    }

    if (!allowedByResource) {
      const { permission: projectPermission } = await permissionService.getProjectPermission({
        actor,
        actorId,
        projectId,
        actorAuthMethod,
        actorOrgId,
        actionProjectType: ActionProjectType.CertificateManager
      });
      ForbiddenError.from(projectPermission).throwUnlessCan(
        ProjectPermissionCertificateActions.Read,
        ProjectPermissionSub.Certificates
      );
      processedRules = getProcessedPermissionRules(
        projectPermission,
        ProjectPermissionCertificateActions.Read,
        ProjectPermissionSub.Certificates
      );
    }

    const options: Parameters<typeof certificateRequestDAL.findByProjectIdWithCertificate>[1] = {
      offset,
      limit,
      search,
      status,
      fromDate,
      toDate,
      profileIds,
      applicationId,
      sortBy,
      sortOrder,
      metadataFilter
    };

    const [certificateRequests, totalCount] = await Promise.all([
      certificateRequestDAL.findByProjectIdWithCertificate(projectId, options, processedRules),
      certificateRequestDAL.countByProjectId(projectId, options, processedRules)
    ]);

    const mappedCertificateRequests = certificateRequests.map(
      ({ encryptedPrivateKey: _encryptedPrivateKey, ...request }) => ({
        ...request,
        status: request.status as CertificateRequestStatus
      })
    );

    return {
      certificateRequests: mappedCertificateRequests,
      totalCount
    };
  };

  const cancelCertificateRequest = async ({
    actor,
    actorId,
    actorAuthMethod,
    actorOrgId,
    certificateRequestId
  }: {
    actor: ActorType;
    actorId: string;
    actorAuthMethod: ActorAuthMethod;
    actorOrgId: string;
    certificateRequestId: string;
  }) => {
    const certificateRequest = await certificateRequestDAL.findById(certificateRequestId);
    if (!certificateRequest) {
      throw new NotFoundError({ message: "Certificate request not found" });
    }

    const { permission } = await permissionService.getProjectPermission({
      actor,
      actorId,
      projectId: certificateRequest.projectId,
      actorAuthMethod,
      actorOrgId,
      actionProjectType: ActionProjectType.CertificateManager
    });

    const requestMetadata = (await resourceMetadataDAL.find({ certificateRequestId: certificateRequest.id })).map(
      ({ key, value }) => ({ key, value: value || "" })
    );

    let allowedByResource = false;
    if (certificateRequest.applicationId) {
      const { permission: resourcePermission } = await permissionService.getResourcePermission({
        actor,
        actorId,
        projectId: certificateRequest.projectId,
        resourceType: ResourceType.CertificateApplication,
        resourceId: certificateRequest.applicationId,
        actorAuthMethod,
        actorOrgId
      });
      allowedByResource = resourcePermission.can(
        ResourcePermissionCertificateActions.Edit,
        ResourcePermissionSub.Certificates
      );
    }
    if (!allowedByResource) {
      ForbiddenError.from(permission).throwUnlessCan(
        ProjectPermissionCertificateActions.Edit,
        subject(ProjectPermissionSub.Certificates, {
          commonName: certificateRequest.commonName ?? undefined,
          altNames: Array.isArray(certificateRequest.altNames)
            ? (certificateRequest.altNames as { type: string; value: string }[]).map((san) => san.value)
            : undefined,
          metadata: requestMetadata
        })
      );
    }

    const previousStatus = certificateRequest.status as CertificateRequestStatus;
    const previousPendingMessage = certificateRequest.pendingMessage ?? null;

    if (
      certificateRequest.status !== CertificateRequestStatus.PENDING &&
      certificateRequest.status !== CertificateRequestStatus.PENDING_VALIDATION
    ) {
      return {
        certificateRequest,
        projectId: certificateRequest.projectId,
        cancelled: false,
        previousStatus,
        previousPendingMessage
      };
    }

    let actorLabel = "user";
    if (actor === ActorType.USER) {
      const user = await userDAL.findById(actorId);
      const name = user
        ? `${user.firstName || ""} ${user.lastName || ""}`.trim() || user.username || user.email || ""
        : "";
      actorLabel = name ? `user ${name}` : "user";
    } else if (actor === ActorType.IDENTITY) {
      const identity = await identityDAL.findById(actorId);
      actorLabel = identity?.name ? `identity ${identity.name}` : "identity";
    }

    const updated = await certificateRequestDAL.transitionFromPending(
      certificateRequestId,
      CertificateRequestStatus.FAILED,
      `Cancelled by ${actorLabel}`
    );

    if (!updated) {
      const refreshed = await certificateRequestDAL.findById(certificateRequestId);
      return {
        certificateRequest: refreshed,
        projectId: certificateRequest.projectId,
        cancelled: false,
        previousStatus,
        previousPendingMessage
      };
    }

    const jobId = `certificate-issuance-${certificateRequestId}`;

    try {
      const signalled = queueService.cancelActiveJob(
        QueueName.CertificateIssuance,
        jobId,
        `Cancelled by ${actorLabel}`
      );
      logger.info(
        `Issued cancellation signal to issuance worker [certificateRequestId=${certificateRequestId}] [signalled=${signalled}]`
      );
    } catch (error) {
      logger.warn(
        error,
        `Failed to signal active issuance job during cancellation [certificateRequestId=${certificateRequestId}]`
      );
    }

    try {
      await queueService.stopJobById(QueueName.CertificateIssuance, jobId);
    } catch (error) {
      logger.warn(
        error,
        `Failed to stop issuance job during cancellation [certificateRequestId=${certificateRequestId}]`
      );
    }

    return {
      certificateRequest: updated,
      projectId: certificateRequest.projectId,
      cancelled: true,
      previousStatus,
      previousPendingMessage
    };
  };

  return {
    createCertificateRequest,
    getCertificateRequest,
    getCertificateFromRequest,
    updateCertificateRequestStatus,
    attachCertificateToRequest,
    cancelCertificateRequest,
    listCertificateRequests
  };
};
