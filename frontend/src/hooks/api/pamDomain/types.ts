import { TActiveDirectoryConnectionDetails } from "./active-directory-types";
import { PamDomainType } from "./enums";

export type TBasePamDomain = {
  id: string;
  projectId: string;
  name: string;
  domainType: PamDomainType;
  gatewayId?: string | null;
  createdAt: string;
  updatedAt: string;
  metadata?: Array<{ id: string; key: string; value: string }>;
};

export type TActiveDirectoryDomain = TBasePamDomain & {
  domainType: PamDomainType.ActiveDirectory;
  connectionDetails: TActiveDirectoryConnectionDetails;
};

export type TPamDomain = TActiveDirectoryDomain;

export type TListPamDomainsDTO = {
  projectId: string;
  search?: string;
  limit?: number;
  offset?: number;
  orderBy?: string;
  orderDirection?: "asc" | "desc";
  filterDomainTypes?: string;
  discoveryFingerprint?: string;
};

export type TCreatePamDomainDTO = {
  domainType: PamDomainType;
  projectId: string;
  name: string;
  gatewayId: string;
  connectionDetails: TActiveDirectoryConnectionDetails;
  metadata?: Array<{ key: string; value?: string }>;
};

export type TUpdatePamDomainDTO = {
  domainType: PamDomainType;
  domainId: string;
  name?: string;
  gatewayId?: string;
  connectionDetails?: TActiveDirectoryConnectionDetails;
  metadata?: Array<{ key: string; value?: string }>;
};

export type TDeletePamDomainDTO = {
  domainType: PamDomainType;
  domainId: string;
};

export type TPamDomainRelatedResource = {
  id: string;
  name: string;
  resourceType: string;
  projectId: string;
};
