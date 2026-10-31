import { TProjectPermission } from "@app/lib/types";

export type TImportCaCrossSignedCertDTO = {
  caId: string;
  certificate: string;
  certificateChain?: string;
} & Omit<TProjectPermission, "projectId">;

export type TGetCaCrossSignedCertDTO = {
  caId: string;
} & Omit<TProjectPermission, "projectId">;

export type TDeleteCaCrossSignedCertDTO = {
  caId: string;
} & Omit<TProjectPermission, "projectId">;
