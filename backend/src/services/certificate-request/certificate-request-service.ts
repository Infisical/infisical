import { ForbiddenError } from "@casl/ability";
import { Knex } from "knex";
import { z } from "zod";

import { ActionProjectType } from "@app/db/schemas";
import { TPermissionServiceFactory } from "@app/ee/services/permission/permission-service-types";
import {
  ProjectPermissionCertificateActions,
  ProjectPermissionCertificateProfileActions,
  ProjectPermissionSub
} from "@app/ee/services/permission/project-permission";
import { getProcessedPermissionRules } from "@app/lib/casl/permission-filter-utils";
import { BadRequestError, NotFoundError } from "@app/lib/errors";
import { TCertificateDALFactory } from "@app/services/certificate/certificate-dal";
import { TCertificateServiceFactory } from "@app/services/certificate/certificate-service";

import { ActorType } from "../auth/auth-type";
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
  permissionService: Pick<TPermissionServiceFactory, "getProjectPermission">;
};

export type TCertificateRequestServiceFactory = ReturnType<typeof certificateRequestServiceFactory>;

const subjectAlternativeNameSchema = z.object({
  type: z.string().max(50),
  value: z.string().max(500)
});

const certificateRequestDataSchema = z
  .object({
    profileId: z.string().uuid().optional(),
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
    locality: z.string().max(255).optional()
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
  permissionService
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
    ...requestData
  }: TCreateCertificateRequestDTO & { tx?: Knex }) => {
    if (actor !== ActorType.ACME_ACCOUNT && actor !== ActorType.PLATFORM && actor !== ActorType.EST_ACCOUNT) {
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

    const { altNames: altNamesInput, ...restValidatedData } = validatedData;

    const certificateRequest = await certificateRequestDAL.create(
      {
        status,
        projectId,
        acmeOrderId,
        ...restValidatedData,
        altNames: altNamesInput ? JSON.stringify(altNamesInput) : null
      },
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
    const { permission } = await permissionService.getProjectPermission({
      actor,
      actorId,
      projectId,
      actorAuthMethod,
      actorOrgId,
      actionProjectType: ActionProjectType.CertificateManager
    });

    ForbiddenError.from(permission).throwUnlessCan(
      ProjectPermissionCertificateActions.Read,
      ProjectPermissionSub.Certificates
    );

    const certificateRequest = await certificateRequestDAL.findById(certificateRequestId);
    if (!certificateRequest) {
      throw new NotFoundError({ message: "Certificate request not found" });
    }

    if (certificateRequest.projectId !== projectId) {
      throw new NotFoundError({ message: "Certificate request not found" });
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

    ForbiddenError.from(permission).throwUnlessCan(
      ProjectPermissionCertificateActions.Read,
      ProjectPermissionSub.Certificates
    );

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
          commonName: certificateRequest.commonName || null,
          organization: certificateRequest.organization || null,
          organizationalUnit: certificateRequest.organizationalUnit || null,
          country: certificateRequest.country || null,
          state: certificateRequest.state || null,
          locality: certificateRequest.locality || null,
          basicConstraints: parsedBasicConstraints,
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

    const canReadPrivateKey = permission.can(
      ProjectPermissionCertificateActions.ReadPrivateKey,
      ProjectPermissionSub.Certificates
    );

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
        commonName: certificateRequest.commonName || null,
        organization: certificateRequest.organization || null,
        organizationalUnit: certificateRequest.organizationalUnit || null,
        country: certificateRequest.country || null,
        state: certificateRequest.state || null,
        locality: certificateRequest.locality || null,
        basicConstraints: parsedBasicConstraints,
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

    return certificateRequestDAL.updateStatus(certificateRequestId, status, errorMessage);
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
    sortBy,
    sortOrder
  }: TListCertificateRequestsDTO) => {
    const { permission } = await permissionService.getProjectPermission({
      actor,
      actorId,
      projectId,
      actorAuthMethod,
      actorOrgId,
      actionProjectType: ActionProjectType.CertificateManager
    });

    ForbiddenError.from(permission).throwUnlessCan(
      ProjectPermissionCertificateActions.Read,
      ProjectPermissionSub.Certificates
    );

    const processedRules = getProcessedPermissionRules(
      permission,
      ProjectPermissionCertificateActions.Read,
      ProjectPermissionSub.Certificates
    );

    const options: Parameters<typeof certificateRequestDAL.findByProjectIdWithCertificate>[1] = {
      offset,
      limit,
      search,
      status,
      fromDate,
      toDate,
      profileIds,
      sortBy,
      sortOrder
    };

    const [certificateRequests, totalCount] = await Promise.all([
      certificateRequestDAL.findByProjectIdWithCertificate(projectId, options, processedRules),
      certificateRequestDAL.countByProjectId(projectId, options, processedRules)
    ]);

    const mappedCertificateRequests = certificateRequests.map((request) => ({
      ...request,
      status: request.status as CertificateRequestStatus
    }));

    return {
      certificateRequests: mappedCertificateRequests,
      totalCount
    };
  };

  return {
    createCertificateRequest,
    getCertificateRequest,
    getCertificateFromRequest,
    updateCertificateRequestStatus,
    attachCertificateToRequest,
    listCertificateRequests
  };
};
