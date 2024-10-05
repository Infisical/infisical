import { Knex } from "knex";

import { TableName } from "@app/db/schemas";

// These utils are meant to mitigate any delays between postgres update and application deployement for the KMS feature
// where slug col was migrated to name col

// this is a postgres function to keep name in-sync with slug during transition period
export const createKmsKeyNameSyncTrigger = async (knex: Knex) => {
  // function to update name if slug is updated
  await knex.raw(`
        CREATE OR REPLACE FUNCTION on_update_kms_key_slug() RETURNS TRIGGER AS $$ BEGIN NEW."name" = NEW."slug";
        RETURN NEW;
        END;
        $$ LANGUAGE plpgsql;
    `);

  // function to set name if kms key created with slug
  await knex.raw(`
        CREATE OR REPLACE FUNCTION on_insert_kms_key() RETURNS TRIGGER AS $$ BEGIN NEW."name" = coalesce(NEW."name", NEW."slug");
        RETURN NEW;
        END;
        $$ LANGUAGE plpgsql;
    `);

  // create trigger to update name if slug is updated
  await knex.raw(`
        CREATE TRIGGER "${TableName.KmsKey}_update_name"
        BEFORE UPDATE OF "slug" ON ${TableName.KmsKey}
        FOR EACH ROW
        EXECUTE PROCEDURE on_update_kms_key_slug();
    `);

  // create trigger to set name if key created with slug
  await knex.raw(`
        CREATE TRIGGER "${TableName.KmsKey}_set_name"
        BEFORE INSERT ON ${TableName.KmsKey}
        FOR EACH ROW
        EXECUTE PROCEDURE on_insert_kms_key();
    `);
};

export const dropKmsKeyNameSyncTrigger = async (knex: Knex) => {
  // drop triggers
  await knex.raw(`DROP TRIGGER IF EXISTS "${TableName.KmsKey}_update_name" ON ${TableName.KmsKey}`);
  await knex.raw(`DROP TRIGGER IF EXISTS "${TableName.KmsKey}_set_name" ON ${TableName.KmsKey}`);

  // drop functions
  await knex.raw(`
        DROP FUNCTION IF EXISTS on_update_kms_key_slug() CASCADE;
    `);
  await knex.raw(`
        DROP FUNCTION IF EXISTS on_insert_kms_key() CASCADE;
    `);
};
