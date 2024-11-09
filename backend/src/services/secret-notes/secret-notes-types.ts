import { OrderByDirection } from '@app/lib/types';

export type TCreateSecretNoteDTO = {
  projectId: string;
  name: string;
  content: string;
};

export type TUpdateSecretNoteByIdDTO = {
  name?: string;
  content?: string;
};

export type TListSecretNotesByProjectIdDTO = {
  projectId: string;
  offset?: number;
  limit?: number;
  orderBy?: SecretNoteOrderBy;
  orderDirection?: OrderByDirection;
  search?: string;
};

export enum SecretNoteOrderBy {
  Name = 'name',
}
