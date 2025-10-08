import { PamResourceType } from "./enums";

export const PAM_RESOURCE_TYPE_MAP: Record<
  PamResourceType,
  { name: string; image: string; size?: number }
> = {
  [PamResourceType.Postgres]: { name: "PostgreSQL", image: "Postgres.png" },
  [PamResourceType.RDP]: { name: "RDP", image: "RDP.png" },
  [PamResourceType.SSH]: { name: "SSH", image: "SSH.png" },
  [PamResourceType.Kubernetes]: { name: "Kubernetes", image: "Kubernetes.png" }
};
