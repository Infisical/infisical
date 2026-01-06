import { PamResourceType } from "../enums";

export interface TBasePamAccount {
  id: string;
  projectId: string;
  folderId?: string | null;
  resourceId: string;
  resource: {
    id: string;
    name: string;
    resourceType: PamResourceType;
    rotationCredentialsConfigured: boolean;
  };
  name: string;
  description?: string | null;
  rotationEnabled: boolean;
  rotationIntervalSeconds?: number;
  requireMfa?: boolean | null;
  lastRotatedAt?: string | null;
  lastRotationMessage?: string | null;
  rotationStatus?: string | null;
  createdAt: string;
  updatedAt: string;
}
