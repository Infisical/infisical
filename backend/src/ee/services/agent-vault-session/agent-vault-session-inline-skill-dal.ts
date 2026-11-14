import { Knex } from "knex";

import { TDbClient } from "@app/db";
import { TableName, TAgentVaultSkills, TAgentVaultSkillVersions } from "@app/db/schemas";
import { DatabaseError } from "@app/lib/errors";
import { logger } from "@app/lib/logger";

export type TAgentVaultSessionInlineSkillDALFactory = ReturnType<typeof agentVaultSessionInlineSkillDALFactory>;

export const DELETE_INLINE_SKILL_FILES_BATCH_SIZE = 1000;

const SKILL = TableName.AgentVaultSkill;
const VERSION = TableName.AgentVaultSkillVersion;

// An inline skill as a session read shows it: never with its files.
export type TAgentVaultInlineSkillRow = Pick<
  TAgentVaultSkills,
  "id" | "projectId" | "name" | "description" | "createdAt"
> &
  Pick<TAgentVaultSkillVersions, "sha256" | "sizeBytes" | "fileCount"> & {
    sessionId: string;
    position: number;
    filesDeletedAt: Date | null;
  };

export type TAgentVaultInlineSkillInsert = Pick<TAgentVaultSkills, "projectId" | "name" | "description"> &
  Pick<TAgentVaultSkillVersions, "sha256" | "sizeBytes" | "fileCount"> & { position: number; encryptedFiles: Buffer };

// An inline skill an agent can still be given, with its sealed files.
export type TAgentVaultInlineSkillFilesRow = TAgentVaultInlineSkillRow & { encryptedFiles: Buffer };

const SKILL_COLUMNS = [
  "id",
  "projectId",
  "sessionId",
  "position",
  "name",
  "description",
  "filesDeletedAt",
  "createdAt"
];
const VERSION_COLUMNS = ["sha256", "sizeBytes", "fileCount"];

/**
 * Skills sent with a session. They are rows of agent_vault_skills with sessionId set, each with the one version that
 * holds its files, so they share every column with a project's own skills, and only these functions read or write
 * them. They belong to that session alone: nothing edits them, no bundle or other session reads them, and only the
 * session's skills fetch opens their files.
 */
export const agentVaultSessionInlineSkillDALFactory = (db: TDbClient) => {
  const summaryColumns = [
    ...SKILL_COLUMNS.map((column) => db.ref(column).withSchema(SKILL)),
    ...VERSION_COLUMNS.map((column) => db.ref(column).withSchema(VERSION))
  ];

  const inlineSkills = (conn: Knex) => conn(SKILL).join(VERSION, `${VERSION}.skillId`, `${SKILL}.id`);

  // Never selects the files, so a read that lists sessions holds none.
  const findSummariesBySessionIds = async (sessionIds: string[], tx?: Knex): Promise<TAgentVaultInlineSkillRow[]> => {
    if (!sessionIds.length) return [];
    try {
      return (await inlineSkills(tx || db.replicaNode())
        .whereIn(`${SKILL}.sessionId`, sessionIds)
        .select(summaryColumns)
        .orderBy(`${SKILL}.position`, "asc")) as TAgentVaultInlineSkillRow[];
    } catch (error) {
      throw new DatabaseError({ error, name: "Find agent vault session inline skills" });
    }
  };

  // Reads the primary, like the rest of the skills fetch: it runs once per agent start, right after mint.
  const findWithFilesBySessionId = async (sessionId: string, tx?: Knex): Promise<TAgentVaultInlineSkillFilesRow[]> => {
    try {
      return (await inlineSkills(tx || db)
        .where(`${SKILL}.sessionId`, sessionId)
        .whereNull(`${SKILL}.filesDeletedAt`)
        .whereNotNull(`${VERSION}.encryptedFiles`)
        .select(...summaryColumns, db.ref("encryptedFiles").withSchema(VERSION))
        .orderBy(`${SKILL}.position`, "asc")) as TAgentVaultInlineSkillFilesRow[];
    } catch (error) {
      throw new DatabaseError({ error, name: "Find agent vault session inline skill files" });
    }
  };

  const insertForSession = async (
    { sessionId, skills }: { sessionId: string; skills: TAgentVaultInlineSkillInsert[] },
    tx: Knex
  ): Promise<TAgentVaultInlineSkillRow[]> => {
    if (!skills.length) return [];
    try {
      const inserted = (await tx(SKILL)
        .insert(
          skills.map(({ projectId, position, name, description }) => ({
            projectId,
            sessionId,
            position,
            name,
            description
          }))
        )
        .returning(SKILL_COLUMNS)) as Omit<TAgentVaultInlineSkillRow, "sha256" | "sizeBytes" | "fileCount">[];
      const sentAt = new Map(skills.map((skill) => [skill.position, skill]));
      await tx(VERSION).insert(
        inserted.map((row) => {
          const { encryptedFiles, sha256, sizeBytes, fileCount } = sentAt.get(row.position)!;
          return { skillId: row.id, version: 1, encryptedFiles, sha256, sizeBytes, fileCount };
        })
      );
      return inserted.map((row) => {
        const { sha256, sizeBytes, fileCount } = sentAt.get(row.position)!;
        return { ...row, sha256, sizeBytes, fileCount };
      });
    } catch (error) {
      throw new DatabaseError({ error, name: "Create agent vault session inline skills" });
    }
  };

  // Keeps the name, description and hash for history. Never writes the session row, whose updatedAt dates an ownerless
  // session's last logs.
  const deleteFilesOf = async (skillIds: string[], tx: Knex) => {
    if (!skillIds.length) return;
    await tx(SKILL).whereIn("id", skillIds).update({ filesDeletedAt: new Date() });
    await tx(VERSION).whereIn("skillId", skillIds).update({ encryptedFiles: null });
  };

  const deleteFilesBySessionId = async (sessionId: string, tx: Knex) => {
    try {
      const rows = (await tx(SKILL).where({ sessionId }).whereNull("filesDeletedAt").select("id")) as {
        id: string;
      }[];
      await deleteFilesOf(
        rows.map((row) => row.id),
        tx
      );
    } catch (error) {
      throw new DatabaseError({ error, name: "Delete agent vault session inline skill files" });
    }
  };

  /**
   * Deletes the files of every inline skill whose session can no longer fetch them: revoked, expired, or left without
   * its owner or the user it acts for, matching deriveSessionStatus. In batches, each its own transaction, so no one
   * transaction grows with the number of sessions that ended since the last run.
   */
  const deleteFilesOfEndedSessions = async () => {
    let deleted = 0;
    try {
      for (;;) {
        // eslint-disable-next-line no-await-in-loop
        const batch = await db.transaction(async (tx) => {
          const rows = (await tx(SKILL)
            .join(TableName.AgentVaultSession, `${TableName.AgentVaultSession}.id`, `${SKILL}.sessionId`)
            .whereNotNull(`${SKILL}.sessionId`)
            .whereNull(`${SKILL}.filesDeletedAt`)
            .where((ended) => {
              void ended
                .whereNotNull(`${TableName.AgentVaultSession}.revokedAt`)
                .orWhere(`${TableName.AgentVaultSession}.expiresAt`, "<=", tx.fn.now())
                .orWhere((ownerless) => {
                  void ownerless
                    .whereNull(`${TableName.AgentVaultSession}.userId`)
                    .whereNull(`${TableName.AgentVaultSession}.identityId`);
                })
                .orWhere((orphaned) => {
                  void orphaned
                    .whereNotNull(`${TableName.AgentVaultSession}.onBehalfOfUserName`)
                    .whereNull(`${TableName.AgentVaultSession}.onBehalfOfUserId`);
                });
            })
            .limit(DELETE_INLINE_SKILL_FILES_BATCH_SIZE)
            .forUpdate(SKILL)
            .skipLocked()
            .select(`${SKILL}.id`)) as { id: string }[];
          await deleteFilesOf(
            rows.map((row) => row.id),
            tx
          );
          return rows.length;
        });
        deleted += batch;
        if (batch < DELETE_INLINE_SKILL_FILES_BATCH_SIZE) break;
      }
    } catch (error) {
      throw new DatabaseError({ error, name: "Delete agent vault inline skill files of ended sessions" });
    }
    if (deleted) {
      logger.info(`frequent-resource-cleanup: deleted the files of ${deleted} agent vault inline skills`);
    }
  };

  return {
    findSummariesBySessionIds,
    findWithFilesBySessionId,
    insertForSession,
    deleteFilesBySessionId,
    deleteFilesOfEndedSessions
  };
};
