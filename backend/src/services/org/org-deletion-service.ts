import { Knex } from "knex";

import { TOrganizations } from "@app/db/schemas";
import { THoneyTokenCleanupServiceFactory } from "@app/ee/services/honey-token/honey-token-cleanup-service";
import { NotFoundError } from "@app/lib/errors";
import { EventModificationType } from "@app/services/event-outbox/event-definition";
import { TEventEmitter } from "@app/services/event-outbox/event-outbox-types";
import { TProjectBotServiceFactory } from "@app/services/project-bot/project-bot-service";
import { TProjectDALFactory } from "@app/services/project/project-dal";
import { TReminderServiceFactory } from "@app/services/reminder/reminder-types";
import { TSecretFolderDALFactory } from "@app/services/secret-folder/secret-folder-dal";
import { TSecretDALFactory } from "@app/services/secret/secret-dal";
import { fnDeleteProjectSecretReminders } from "@app/services/secret/secret-fns";

import { TOrgDALFactory } from "./org-dal";
import { OrganizationModifiedEventV1 } from "./org-events";

type TOrgDeletionServiceFactoryDep = {
  orgDAL: Pick<TOrgDALFactory, "deleteById" | "transaction">;
  projectDAL: Pick<TProjectDALFactory, "find">;
  secretDAL: Pick<TSecretDALFactory, "find">;
  folderDAL: Pick<TSecretFolderDALFactory, "findByProjectId">;
  projectBotService: Pick<TProjectBotServiceFactory, "getBotKey">;
  reminderService: Pick<TReminderServiceFactory, "deleteReminderBySecretId">;
  honeyTokenCleanupService: Pick<THoneyTokenCleanupServiceFactory, "revokeOrgHoneyTokens">;
  eventEmitter: TEventEmitter;
};

export type TOrgDeletionServiceFactory = ReturnType<typeof orgDeletionServiceFactory>;

// Event goes out in the delete's tx, so the license server still hears about it if we crash right
// after commit.
export const orgDeletionServiceFactory = ({
  orgDAL,
  projectDAL,
  secretDAL,
  folderDAL,
  projectBotService,
  reminderService,
  honeyTokenCleanupService,
  eventEmitter
}: TOrgDeletionServiceFactoryDep) => {
  // inDeleteTx runs in the delete's tx, so if it throws the org isn't deleted either.
  function deleteOrganization(orgId: string): Promise<TOrganizations>;
  function deleteOrganization<T>(
    orgId: string,
    inDeleteTx: (deletedOrg: TOrganizations, tx: Knex) => Promise<T>
  ): Promise<T>;
  async function deleteOrganization<T>(
    orgId: string,
    inDeleteTx?: (deletedOrg: TOrganizations, tx: Knex) => Promise<T>
  ): Promise<TOrganizations | T> {
    // Outside the tx on purpose: the cleanup grabs its own connections, so inside it we'd hold one
    // pool conn while waiting on another.
    const projects = await projectDAL.find({ orgId });
    for await (const project of projects) {
      await fnDeleteProjectSecretReminders(project.id, {
        secretDAL,
        reminderService,
        projectBotService,
        folderDAL
      });
    }
    await honeyTokenCleanupService.revokeOrgHoneyTokens(orgId);

    return orgDAL.transaction(async (tx) => {
      const deletedOrg = await orgDAL.deleteById(orgId, tx);
      if (!deletedOrg) {
        throw new NotFoundError({ message: `Organization with ID '${orgId}' not found` });
      }

      await OrganizationModifiedEventV1.emit(
        eventEmitter,
        {
          organizationId: deletedOrg.id,
          rootOrgId: deletedOrg.rootOrgId ?? null,
          modificationType: EventModificationType.Deleted
        },
        tx
      );

      return inDeleteTx ? inDeleteTx(deletedOrg, tx) : deletedOrg;
    });
  }

  return { deleteOrganization };
};
