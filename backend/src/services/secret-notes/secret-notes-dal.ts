import { Knex } from 'knex';
import { TDbClient } from '@app/db';
import {
  ConsumerSecretsSchema,
  TableName,
  TConsumerSecrets,
  TConsumerSecretsInsert,
} from '@app/db/schemas';
import { DatabaseError } from '@app/lib/errors';
import { selectAllTableCols } from '@app/lib/knex';
import {
  SecretNoteOrderBy,
  TListSecretNotesByProjectIdDTO,
} from './secret-notes-types';
import { OrderByDirection } from '@app/lib/types';

export const secretNotesDALFactory = (db: TDbClient) => {
  const findById = async (id: string, tx?: Knex) => {
    try {
      const result = await (tx || db.replicaNode())(TableName.ConsumerSecrets)
        .where({ id, type: 'secret_note' })
        .first()
        .select(selectAllTableCols(TableName.ConsumerSecrets));

      return ConsumerSecretsSchema.parse(result);
    } catch (error) {
      throw new DatabaseError({ error, name: 'Find secret note by id' });
    }
  };

  const create = async (data: TConsumerSecretsInsert, tx?: Knex) => {
    try {
      const result = await (tx || db)(TableName.ConsumerSecrets)
        .insert(data)
        .returning('*');

      return ConsumerSecretsSchema.parse(result[0]);
    } catch (error) {
      throw new DatabaseError({ error, name: 'Create secret note' });
    }
  };

  const updateById = async (
    id: string,
    data: { name?: string; content?: string },
    tx?: Knex,
  ) => {
    try {
      const result = await (tx || db)(TableName.ConsumerSecrets)
        .where({ id, type: 'secret_note' })
        .update({
          name: data.name,
          fields: db.raw("jsonb_set(fields, '{content}', ?::jsonb)", [
            JSON.stringify(data.content),
          ]),
        })
        .returning('*');

      return ConsumerSecretsSchema.parse(result[0]);
    } catch (error) {
      throw new DatabaseError({ error, name: 'Update secret note by id' });
    }
  };

  const deleteById = async (id: string, tx?: Knex) => {
    try {
      await (tx || db)(TableName.ConsumerSecrets)
        .where({ id, type: 'secret_note' })
        .delete();
    } catch (error) {
      throw new DatabaseError({ error, name: 'Delete secret note by id' });
    }
  };

  const findByProjectId = async (
    {
      projectId,
      offset = 0,
      limit,
      orderBy = SecretNoteOrderBy.Name,
      orderDirection = 'asc' as OrderByDirection,
      search,
    }: TListSecretNotesByProjectIdDTO,
    tx?: Knex,
  ) => {
    try {
      const query = (tx || db.replicaNode())(TableName.ConsumerSecrets)
        .where('project_id', projectId)
        .andWhere('type', 'secret_note')
        .where((qb) => {
          if (search) {
            void qb.whereILike('name', `%${search}%`);
          }
        })
        .select(
          selectAllTableCols(TableName.ConsumerSecrets),
          db.raw(`count(*) OVER() as total_count`) as any,
        )
        .orderBy(orderBy, orderDirection);

      if (limit) {
        void query.limit(limit).offset(offset);
      }

      const data = await query;

      return { secrets: data, totalCount: Number(data?.[0]?.total_count ?? 0) };
    } catch (error) {
      throw new DatabaseError({
        error,
        name: 'Find secret notes by project id',
      });
    }
  };

  return {
    findById,
    create,
    updateById,
    deleteById,
    findByProjectId,
  };
};
