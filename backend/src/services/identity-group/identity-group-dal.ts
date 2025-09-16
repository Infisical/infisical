import { TDbClient } from "@app/db";
import { TableName } from "@app/db/schemas";

export type TIdentityGroupDALFactory = ReturnType<typeof identityGroupDALFactory>;

export const identityGroupDALFactory = (db: TDbClient) => {

  return {  };
};
