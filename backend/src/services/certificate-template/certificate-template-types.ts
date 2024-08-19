import { TProjectPermission } from "@app/lib/types";

export type TCreateCertTemplateDTO = {
  caId: string;
  pkiCollectionId?: string;
  name: string;
  commonName: string;
  subjectAlternativeName: string;
  ttl: string;
} & Omit<TProjectPermission, "projectId">;

export type TUpdateCertTemplateDTO = {
  id: string;
  caId?: string;
  pkiCollectionId?: string;
  name?: string;
  commonName?: string;
  subjectAlternativeName?: string;
  ttl?: string;
} & Omit<TProjectPermission, "projectId">;

export type TGetCertTemplateDTO = {
  id: string;
} & Omit<TProjectPermission, "projectId">;

export type TDeleteCertTemplateDTO = {
  id: string;
} & Omit<TProjectPermission, "projectId">;
