import { z } from "zod";

import { OrderByDirection, TProjectPermission } from "@app/lib/types";
import { TKmsServiceFactory } from "@app/services/kms/kms-service";
import { TResourceMetadataDALFactory } from "@app/services/resource-metadata/resource-metadata-dal";
import { ResourceMetadataNonEncryptionSchema } from "@app/services/resource-metadata/resource-metadata-schema";

import { TGatewayV2ServiceFactory } from "../gateway-v2/gateway-v2-service";
import { TPamResourceDALFactory } from "../pam-resource/pam-resource-dal";
import { TPostRotateContext } from "../pam-resource/pam-resource-types";
import { TPermissionServiceFactory } from "../permission/permission-service-types";
import { TActiveDirectoryConnectionDetails } from "./active-directory/active-directory-domain-types";
import { TPamDomainDALFactory } from "./pam-domain-dal";
import { PamDomainOrderBy, PamDomainType } from "./pam-domain-enums";

export type TPamDomainConnectionDetails = TActiveDirectoryConnectionDetails;

export type TPamDomain = {
  id: string;
  projectId: string;
  name: string;
  domainType: PamDomainType;
  gatewayId?: string | null;
  discoveryFingerprint?: string | null;
  createdAt: Date;
  updatedAt: Date;
  connectionDetails: TPamDomainConnectionDetails;
  metadata?: Array<{ id: string; key: string; value: string }>;
};

export type TCreateDomainDTO = {
  projectId: string;
  name: string;
  domainType: PamDomainType;
  gatewayId?: string | null;
  connectionDetails: TPamDomainConnectionDetails;
  metadata?: z.input<typeof ResourceMetadataNonEncryptionSchema>;
};

export type TUpdateDomainDTO = {
  domainId: string;
  name?: string;
  gatewayId?: string | null;
  connectionDetails?: TPamDomainConnectionDetails;
  metadata?: z.input<typeof ResourceMetadataNonEncryptionSchema>;
};

export type TListDomainsDTO = {
  search?: string;
  orderBy?: PamDomainOrderBy;
  orderDirection?: OrderByDirection;
  limit?: number;
  offset?: number;
  discoveryFingerprint?: string;
  filterDomainTypes?: string[];
} & TProjectPermission;

export type TDeleteDomainDTO = {
  domainId: string;
};

export type TPamDomainServiceFactoryDep = {
  pamDomainDAL: TPamDomainDALFactory;
  pamResourceDAL: Pick<TPamResourceDALFactory, "find" | "findById">;
  permissionService: Pick<TPermissionServiceFactory, "getProjectPermission">;
  kmsService: Pick<TKmsServiceFactory, "createCipherPairWithDataKey">;
  gatewayV2Service: Pick<TGatewayV2ServiceFactory, "getPlatformConnectionDetailsByGatewayId">;
  resourceMetadataDAL: Pick<TResourceMetadataDALFactory, "insertMany" | "delete">;
};

export type TPamDomainFactory<T, C> = (
  domainType: PamDomainType,
  connectionDetails: T,
  gatewayId: string | null | undefined,
  gatewayV2Service: Pick<TGatewayV2ServiceFactory, "getPlatformConnectionDetailsByGatewayId">,
  projectId: string | null | undefined
) => {
  validateConnection: () => Promise<T>;
  validateAccountCredentials: (credentials: C) => Promise<C>;
  rotateAccountCredentials: (rotationAccountCredentials: C, currentCredentials: C) => Promise<C>;
  postRotate?: (
    accountId: string,
    newCredentials: C,
    projectId: string,
    ctx: TPostRotateContext,
    rotationAccountCredentials: C
  ) => Promise<void>;
  handleOverwritePreventionForCensoredValues: (updatedAccountCredentials: C, currentCredentials: C) => Promise<C>;
};
