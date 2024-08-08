export type TPkiCollection = {
  id: string;
  name: string;
  projectId: string;
  createdAt: string;
  updatedAt: string;
};

export type TCreatePkiCollectionDTO = {
  projectId: string;
  name: string;
};

export type TUpdatePkiCollectionTO = {
  collectionId: string;
  projectId: string;
  name?: string;
};

export type TDeletePkiCollectionDTO = {
  collectionId: string;
  projectId: string;
};
