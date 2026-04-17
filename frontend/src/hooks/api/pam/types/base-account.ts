import { PamResourceType } from "../enums";

export interface TBasePamAccount {
  id: string;
  projectId: string;
  parentType: string;
  folderId?: string | null;
  resourceId?: string | null;
  domainId?: string | null;
  resource?: {
    id: string;
    name: string;
    resourceType: PamResourceType;
    rotationCredentialsConfigured: boolean;
  } | null;
  domain?: {
    id: string;
    name: string;
    domainType: string;
  } | null;
  name: string;
  description?: string | null;
  credentialsConfigured: boolean;
  requireMfa?: boolean | null;
  lastRotatedAt?: string | null;
  lastRotationMessage?: string | null;
  rotationStatus?: string | null;
  dependencyCount?: number;
  policyId?: string | null;
  policyName?: string | null;
  metadata?: { key: string; value: string }[];
  createdAt: string;
  updatedAt: string;
}
