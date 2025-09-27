import { PamResourceType } from "../enums";

export type TPamResourceOptionBase = {
  name: string;
};

export type TPostgresResourceOption = TPamResourceOptionBase & {
  resource: PamResourceType.Postgres;
};

export type TPamResourceOption = TPostgresResourceOption;
