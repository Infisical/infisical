import {
  ProxiedServiceCredentialRole,
  ProxiedServiceHeaderPurpose,
  ProxiedServiceSubstitutionSurface
} from "./enums";

export type TProxiedServiceCredential = {
  id: string;
  serviceId: string;
  secretKey: string;
  role: ProxiedServiceCredentialRole;
  headerName?: string | null;
  headerPrefix?: string | null;
  headerPurpose?: ProxiedServiceHeaderPurpose | null;
  placeholderKey?: string | null;
  placeholderValue?: string | null;
  substitutionSurfaces?: ProxiedServiceSubstitutionSurface[] | null;
};

// Shape returned by the DELETE endpoint (base schema, no credentials).
export type TProxiedServiceBase = {
  id: string;
  name: string;
  hostPattern: string;
  isEnabled: boolean;
  folderId: string;
  createdAt: string;
  updatedAt: string;
};

export type TProxiedService = TProxiedServiceBase & {
  credentials: TProxiedServiceCredential[];
};

// Shape returned by the dashboard aggregate endpoint (includes environment + folder path).
export type TDashboardProxiedService = TProxiedService & {
  environment: {
    id: string;
    name: string;
    slug: string;
  };
  folder: {
    path: string;
  };
};

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

export type TDeleteProxiedServiceDTO = {
  serviceId: string;
};
