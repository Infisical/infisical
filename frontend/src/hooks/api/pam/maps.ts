import { PamResourceType } from "./enums";

export const PAM_RESOURCE_TYPE_MAP: Record<
  PamResourceType,
  { name: string; image: string; size?: number }
> = {
  [PamResourceType.Postgres]: { name: "PostgreSQL", image: "Postgres.png" }
};
