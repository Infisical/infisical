import { TProjectPermission } from "@app/lib/types";

export enum CAType {
  ROOT = "root",
  INTERMEDIATE = "intermediate"
}

// TODO: attach permissions after draft impl

export type TCreateCaDTO = {
  projectSlug: string;
  type: CAType;
  commonName: string;
  organization: string;
  ou: string;
  country: string;
  province: string;
  locality: string;
} & Omit<TProjectPermission, "projectId">;

export type TGetCaCsrDTO = {
  caId: string;
} & Omit<TProjectPermission, "projectId">;

export type TGetCaCertDTO = {
  caId: string;
} & Omit<TProjectPermission, "projectId">;

export type TIssueCertFromCaDTO = {
  caId: string;
  csr: string;
  notBefore: string;
  notAfter: string;
} & Omit<TProjectPermission, "projectId">;
