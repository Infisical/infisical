import { z } from 'zod';
import { NOTES } from '@app/lib/api-docs';
import { readLimit, writeLimit } from '@app/server/config/rateLimiter';
import { verifyAuth } from '@app/server/plugins/auth/verify-auth';
import { AuthMode } from '@app/services/auth/auth-type';
import { SecretNoteOrderBy } from '@app/services/secret-notes/secret-notes-types';
import { OrderByDirection } from '@app/lib/types';

export const registerSecretNotesRouter = async (server: FastifyZodProvider) => {
  server.route({
    method: 'POST',
    url: '/secret-notes',
    config: {
      rateLimit: writeLimit,
    },
    schema: {
      description: 'Create Secret Note',
      body: z.object({
        projectId: z.string().describe(NOTES.CREATE_NOTE.projectId),
        name: z.string().min(1).max(32).describe(NOTES.CREATE_NOTE.name),
        content: z.string().describe(NOTES.CREATE_NOTE.content),
      }),
      response: {
        200: z.object({
          note: z.object({
            id: z.string().uuid(),
            name: z.string(),
            content: z.string(),
          }),
        }),
      },
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]),
    handler: async (req) => {
      const { projectId, name, content } = req.body;
      const note = await server.services.secretNotes.createSecretNote({
        projectId,
        name,
        content,
      });
      return { note };
    },
  });

  server.route({
    method: 'PATCH',
    url: '/secret-notes/:noteId',
    config: {
      rateLimit: writeLimit,
    },
    schema: {
      description: 'Update Secret Note',
      params: z.object({
        noteId: z.string().uuid().describe(NOTES.UPDATE_NOTE.noteId),
      }),
      body: z.object({
        name: z
          .string()
          .min(1)
          .max(32)
          .optional()
          .describe(NOTES.UPDATE_NOTE.name),
        content: z.string().optional().describe(NOTES.UPDATE_NOTE.content),
      }),
      response: {
        200: z.object({
          note: z.object({
            id: z.string().uuid(),
            name: z.string(),
            content: z.string(),
          }),
        }),
      },
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]),
    handler: async (req) => {
      const { noteId } = req.params;
      const { name, content } = req.body;
      const note = await server.services.secretNotes.updateSecretNoteById(
        noteId,
        {
          name,
          content,
        },
      );
      return { note };
    },
  });

  server.route({
    method: 'DELETE',
    url: '/secret-notes/:noteId',
    config: {
      rateLimit: writeLimit,
    },
    schema: {
      description: 'Delete Secret Note',
      params: z.object({
        noteId: z.string().uuid().describe(NOTES.DELETE_NOTE.noteId),
      }),
      response: {
        200: z.object({
          success: z.boolean(),
        }),
      },
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]),
    handler: async (req) => {
      const { noteId } = req.params;
      await server.services.secretNotes.deleteSecretNoteById(noteId);
      return { success: true };
    },
  });

  server.route({
    method: 'GET',
    url: '/secret-notes',
    config: {
      rateLimit: readLimit,
    },
    schema: {
      description: 'List Secret Notes',
      querystring: z.object({
        projectId: z.string().describe(NOTES.LIST_NOTES.projectId),
        offset: z.coerce
          .number()
          .min(0)
          .optional()
          .default(0)
          .describe(NOTES.LIST_NOTES.offset),
        limit: z.coerce
          .number()
          .min(1)
          .max(100)
          .optional()
          .default(100)
          .describe(NOTES.LIST_NOTES.limit),
        orderBy: z
          .nativeEnum(SecretNoteOrderBy)
          .optional()
          .default(SecretNoteOrderBy.Name)
          .describe(NOTES.LIST_NOTES.orderBy),
        orderDirection: z
          .nativeEnum(OrderByDirection)
          .optional()
          .default(OrderByDirection.ASC)
          .describe(NOTES.LIST_NOTES.orderDirection),
        search: z.string().trim().optional().describe(NOTES.LIST_NOTES.search),
      }),
      response: {
        200: z.object({
          notes: z.array(
            z.object({
              id: z.string().uuid(),
              name: z.string(),
              content: z.string(),
            }),
          ),
          totalCount: z.number(),
        }),
      },
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]),
    handler: async (req) => {
      const { projectId, ...dto } = req.query;
      const { notes, totalCount } =
        await server.services.secretNotes.listSecretNotesByProjectId({
          projectId,
          ...dto,
        });
      return { notes, totalCount };
    },
  });
};
