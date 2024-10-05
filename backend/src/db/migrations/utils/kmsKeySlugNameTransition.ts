import { Knex } from "knex";

import { TableName } from "@app/db/schemas";

// These utils are meant to mitigate any delays between postgres update and application deployement for the KMS feature
// where slug col was migrated to name col

// this is a postgres function to keep name in-sync with slug during transition period
export const createKmsKeyNameSyncTrigger = async (knex: Knex) => {
  // create function
  await knex.raw(`
        CREATE OR REPLACE FUNCTION on_sync_kms_key_name() RETURNS TRIGGER AS $$ BEGIN NEW."name" = NEW."slug";
        RETURN NEW;
        END;
        $$ LANGUAGE plpgsql;
    `);

  // create trigger
  await knex.raw(`
        CREATE TRIGGER "${TableName.KmsKey}_name_sync"
        BEFORE INSERT OR UPDATE OF "slug" ON ${TableName.KmsKey}
        FOR EACH ROW
        EXECUTE PROCEDURE on_sync_kms_key_name();
    `);
};

export const dropKmsKeyNameSyncTrigger = async (knex: Knex) => {
  // drop trigger
  await knex.raw(`DROP TRIGGER IF EXISTS "${TableName.KmsKey}_name_sync" ON ${TableName.KmsKey}`);

  // drop function
  await knex.raw(`
        DROP FUNCTION IF EXISTS on_sync_kms_key_name() CASCADE;
    `);
};
