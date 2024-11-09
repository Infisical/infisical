import { OrderByDirection } from '@app/hooks/api/generic/types';

export type TSecretNote = {
  id: string;
  name: string;
  content: string;
  projectId: string;
  createdAt: string;
  updatedAt: string;
};

type ProjectRef = { projectId: string };
type NoteRef = { noteId: string; projectId: string };

export type TCreateSecretNote = Pick<TSecretNote, 'name' | 'content'> &
  ProjectRef;
export type TUpdateSecretNote = NoteRef &
  Partial<Pick<TSecretNote, 'name' | 'content'>>;
export type TDeleteSecretNote = NoteRef;

export type TProjectSecretNotesList = {
  notes: TSecretNote[];
  totalCount: number;
};

export type TListProjectSecretNotesDTO = {
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
