import { TProjectPermission } from "@app/lib/types";

export type TGetCrl = {
  caId: string;
} & Omit<TProjectPermission, "projectId">;
