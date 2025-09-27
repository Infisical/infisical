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
  };
  name: string;
  description?: string | null;
  createdAt: string;
  updatedAt: string;
}
