import { Knex } from "knex";

import { TGenericPermission } from "@app/lib/types";

export type TCreateIdentityGroupDTO = {
  name: string;
  slug?: string;
  role: string;
} & TGenericPermission;