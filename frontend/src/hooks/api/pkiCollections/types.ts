export type TPkiCollection = {
  id: string;
  name: string;
  description: string;
  projectId: string;
  createdAt: string;
  updatedAt: string;
};

export type TCreatePkiCollectionDTO = {
  projectId: string;
  name: string;
  description: string;
};

export type TUpdatePkiCollectionTO = {
  collectionId: string;
  projectId: string;
  name?: string;
  description?: string;
};

export type TDeletePkiCollectionDTO = {
  collectionId: string;
  projectId: string;
};

export type TPkiCollectionItem = {
  id: string;
  collectionId: string;
  type: string;
  itemId: string;
  createdAt: string;
  updatedAt: string;
};

export type TAddItemToPkiCollectionDTO = {
  collectionId: string;
  type: string;
  itemId: string;
};

export type TRemoveItemFromPkiCollectionDTO = {
  collectionId: string;
  itemId: string;
};
