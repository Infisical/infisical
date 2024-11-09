import { Knex } from 'knex';
import { NotFoundError } from '@app/lib/errors';
import { TDbClient } from '@app/db';
import { TConsumerSecrets } from '@app/db/schemas/consumer-secrets';
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
      project_id: data.projectId,
      type: 'secret_note',
      name: data.name,
      fields: { content: data.content },
    };

    const secret = await secretNotesDAL.create(secretNoteData, tx);
    return convertToSecretNote(secret);
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
    const updatedSecret = await secretNotesDAL.updateById(
      id,
      { name: data.name, content: data.content },
      tx,
    );
    return convertToSecretNote(updatedSecret);
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
    const { secrets, totalCount } = await secretNotesDAL.findByProjectId(
      options,
      tx,
    );

    // Transform the secrets to extract content from fields
    const notes = secrets.map(convertToSecretNote);

    return { notes, totalCount };
  };

  // Helper function to convert a consumer secret to a secret note
  const convertToSecretNote = (secret: TConsumerSecrets) => ({
    id: secret.id,
    name: secret.name,
    content: (secret.fields as { content: string }).content, // Extract content from fields
    projectId: secret.project_id,
    createdAt: secret.created_at,
    updatedAt: secret.updated_at,
  });

  return {
    createSecretNote,
    updateSecretNoteById,
    deleteSecretNoteById,
    listSecretNotesByProjectId,
  };
};
