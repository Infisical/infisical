import {
  ProxiedServiceCredentialRole,
  ProxiedServiceHeaderPurpose,
  ProxiedServiceSubstitutionSurface
} from "./enums";

// A service is project-scoped, so each credential names the environment and path its secret resolves at.
// That is what lets one service reference secrets across folders without a secret import.
export type TProxiedServiceCredential = {
  id: string;
  serviceId: string;
  environment: string;
  secretPath: string;
  secretKey?: string | null;
  role: ProxiedServiceCredentialRole;
  headerName?: string | null;
  headerPrefix?: string | null;
  headerPurpose?: ProxiedServiceHeaderPurpose | null;
  placeholderKey?: string | null;
  placeholderValue?: string | null;
  substitutionSurfaces?: ProxiedServiceSubstitutionSurface[] | null;
  dynamicSecretName?: string | null;
  dynamicSecretField?: string | null;
};

export type TProxiedServiceBase = {
  id: string;
  name: string;
  hostPattern: string;
  isEnabled: boolean;
  projectId: string;
  configuredByLabel: string;
  configuredAt: string;
  createdAt: string;
  updatedAt: string;
  lastUsedAt?: string | null;
};

export type TProxiedService = TProxiedServiceBase & {
  credentials: TProxiedServiceCredential[];
};

export type TProxiedServiceCredentialInput = {
  environment: string;
  secretPath: string;
  secretKey?: string;
  role: ProxiedServiceCredentialRole;
  headerName?: string | null;
  headerPrefix?: string | null;
  headerPurpose?: ProxiedServiceHeaderPurpose | null;
  placeholderKey?: string | null;
  placeholderValue?: string | null;
  substitutionSurfaces?: ProxiedServiceSubstitutionSurface[] | null;
  dynamicSecretName?: string;
  dynamicSecretField?: string;
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

export type TDeleteProxiedServiceDTO = {
  serviceId: string;
};

export type TListProxiedServicesDTO = {
  projectId: string;
  search?: string;
};
