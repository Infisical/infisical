import { TDbClient } from "@app/db";
import { TableName } from "@app/db/schemas/models";
import { ormify } from "@app/lib/knex";

export type TWebAuthnCredentialDALFactory = ReturnType<typeof webAuthnCredentialDALFactory>;

export const webAuthnCredentialDALFactory = (db: TDbClient) => {
  const webAuthnCredentialDal = ormify(db, TableName.WebAuthnCredential);

  return webAuthnCredentialDal;
};
