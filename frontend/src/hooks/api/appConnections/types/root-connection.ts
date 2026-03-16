import { ProjectType } from "@app/hooks/api/projects/types";

import { AppConnectionCredentialRotationStatus } from "./root-connection-enums";

export type TRootAppConnection = {
  id: string;
  name: string;
  description?: string | null;
  version: number;
  orgId: string;
  createdAt: string;
  updatedAt: string;
  isPlatformManagedCredentials?: boolean;
  isAutoRotationEnabled?: boolean;
  rotation?: {
    nextRotationAt: Date;
    lastRotationMessage?: string | null;
    rotationInterval: number;
    rotationStatus: AppConnectionCredentialRotationStatus;
    rotateAtUtc: {
      hours: number;
      minutes: number;
    };
  };
  gatewayId?: string | null;
  projectId?: string | null;
  project?: {
    name: string;
    type: ProjectType;
    slug: string;
    id: string;
  } | null;
};
