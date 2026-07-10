import { OrderByDirection } from "@app/lib/types";

import {
  ProxiedServiceCredentialRole,
  ProxiedServiceHeaderPurpose,
  ProxiedServiceSubstitutionSurface
} from "./proxied-service-enums";

export type TProxiedServiceCredentialInput = {
  secretKey: string;
  role: ProxiedServiceCredentialRole;
  headerName?: string | null;
  headerPrefix?: string | null;
  headerPurpose?: ProxiedServiceHeaderPurpose | null;
  placeholderKey?: string | null;
  placeholderValue?: string | null;
  substitutionSurfaces?: ProxiedServiceSubstitutionSurface[] | null;
};

export type TCreateProxiedServiceDTO = {
  projectId: string;
  environment: string;
  secretPath: string;
  name: string;
  hostPattern: string;
  isEnabled?: boolean;
  credentials: TProxiedServiceCredentialInput[];
};

export type TUpdateProxiedServiceDTO = {
  serviceId: string;
  name?: string;
  hostPattern?: string;
  isEnabled?: boolean;
  credentials?: TProxiedServiceCredentialInput[];
};

export type TGetProxiedServiceByIdDTO = {
  serviceId: string;
};

export type TGetProxiedServiceByNameDTO = {
  projectId: string;
  environment: string;
  secretPath: string;
  name: string;
};

export type TDeleteProxiedServiceDTO = {
  serviceId: string;
};

export type TListProxiedServicesDTO = {
  projectId: string;
  environment: string;
  secretPath: string;
};

export type TProxiedServiceDashboardListDTO = {
  projectId: string;
  environments: string[];
  secretPath: string;
  search?: string;
  // accepted for parity with the dashboard router's query param; the DAL always orders by name
  orderBy?: "name";
  orderDirection?: OrderByDirection;
  limit?: number;
  offset?: number;
};

export type TProxiedServiceDashboardCountDTO = {
  projectId: string;
  environments: string[];
  secretPath: string;
  search?: string;
};
