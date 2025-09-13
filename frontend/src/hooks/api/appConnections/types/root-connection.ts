import { ProjectType } from "@app/hooks/api/workspace/types";

export type TRootAppConnection = {
  id: string;
  name: string;
  description?: string | null;
  version: number;
  orgId: string;
  createdAt: string;
  updatedAt: string;
  isPlatformManagedCredentials?: boolean;
  gatewayId?: string | null;
  projectId?: string | null;
  project?: {
    name: string;
    type: ProjectType;
    slug: string;
    id: string;
  } | null;
};
