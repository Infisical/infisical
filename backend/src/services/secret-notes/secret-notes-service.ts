import { Knex } from 'knex';
import { NotFoundError } from '@app/lib/errors';
import { TDbClient } from '@app/db';
import {
  TCreateSecretNoteDTO,
  TUpdateSecretNoteByIdDTO,
  TListSecretNotesByProjectIdDTO,
} from './secret-notes-types';
import { secretNotesDALFactory } from './secret-notes-dal';

export const secretNotesServiceFactory = (db: TDbClient) => {
  const secretNotesDAL = secretNotesDALFactory(db);

  const createSecretNote = async (data: TCreateSecretNoteDTO, tx?: Knex) => {
    const secretNoteData = {
      user_id: '',
      project_id: data.projectId,
      type: 'secret_note',
      name: data.name,
      fields: { content: data.content },
    };

    return secretNotesDAL.create(secretNoteData, tx);
  };

  const updateSecretNoteById = async (
    id: string,
    data: TUpdateSecretNoteByIdDTO,
    tx?: Knex,
  ) => {
    const existingNote = await secretNotesDAL.findById(id, tx);
    if (!existingNote) {
      throw new NotFoundError({
        message: `Secret note with ID '${id}' not found`,
      });
    }
    return secretNotesDAL.updateById(
      id,
      { ...data, fields: { content: data.content } },
      tx,
    );
  };

  const deleteSecretNoteById = async (id: string, tx?: Knex) => {
    const existingNote = await secretNotesDAL.findById(id, tx);
    if (!existingNote) {
      throw new NotFoundError({
        message: `Secret note with ID '${id}' not found`,
      });
    }
    return secretNotesDAL.deleteById(id, tx);
  };

  const listSecretNotesByProjectId = async (
    options: TListSecretNotesByProjectIdDTO,
    tx?: Knex,
  ) => {
    return secretNotesDAL.findByProjectId(options, tx);
  };

  return {
    createSecretNote,
    updateSecretNoteById,
    deleteSecretNoteById,
    listSecretNotesByProjectId,
  };
};
