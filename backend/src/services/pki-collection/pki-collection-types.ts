import { TProjectPermission } from "@app/lib/types";

export type TCreatePkiCollectionDTO = {
  name: string;
  description: string;
} & TProjectPermission;

export type TGetPkiCollectionByIdDTO = {
  collectionId: string;
} & Omit<TProjectPermission, "projectId">;

export type TUpdatePkiCollectionDTO = {
  collectionId: string;
  name?: string;
  description?: string;
} & Omit<TProjectPermission, "projectId">;

export type TDeletePkiCollectionDTO = {
  collectionId: string;
} & Omit<TProjectPermission, "projectId">;

export enum PkiItemType {
  CERTIFICATE = "certificate",
  CA = "ca"
}

export const pkiItemTypeToNameMap: { [K in PkiItemType]: string } = {
  [PkiItemType.CA]: "CA",
  [PkiItemType.CERTIFICATE]: "Certificate"
};

export type TGetPkiCollectionItems = {
  collectionId: string;
  type?: PkiItemType;
  offset: number;
  limit: number;
} & Omit<TProjectPermission, "projectId">;

export type TAddItemToPkiCollectionDTO = {
  collectionId: string;
  type: PkiItemType;
  itemId: string;
} & Omit<TProjectPermission, "projectId">;

export type TRemoveItemFromPkiCollectionDTO = {
  collectionId: string;
  itemId: string;
} & Omit<TProjectPermission, "projectId">;
