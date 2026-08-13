import { OrderByDirection } from "@app/lib/types";

import {
  ProxiedServiceCredentialRole,
  ProxiedServiceHeaderPurpose,
  ProxiedServiceSubstitutionSurface
} from "./proxied-service-enums";

// A service is project-scoped, so each credential carries its own location. That is what lets one
// service reference secrets across environments and folders without a secret import or a ${} reference.
export type TProxiedServiceCredentialInput = {
  environment: string;
  secretPath: string;
  secretKey?: string | null;
  dynamicSecretName?: string | null;
  dynamicSecretField?: string | null;
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

export type TDeleteProxiedServiceDTO = {
  serviceId: string;
};

export type TListProxiedServicesDTO = {
  projectId: string;
  search?: string;
  orderDirection?: OrderByDirection;
  limit?: number;
  offset?: number;
};
