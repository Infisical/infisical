import { TActorInput } from "@app/lib/types";

export type TCreatePkiCollectionDTO = {
  name: string;
  description: string;
  projectId: string;
} & TActorInput;

export type TGetPkiCollectionByIdDTO = {
  collectionId: string;
} & TActorInput;

export type TUpdatePkiCollectionDTO = {
  collectionId: string;
  name?: string;
  description?: string;
} & TActorInput;

export type TDeletePkiCollectionDTO = {
  collectionId: string;
} & TActorInput;

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
} & TActorInput;

export type TAddItemToPkiCollectionDTO = {
  collectionId: string;
  type: PkiItemType;
  itemId: string;
} & TActorInput;

export type TRemoveItemFromPkiCollectionDTO = {
  collectionId: string;
  itemId: string;
} & TActorInput;
