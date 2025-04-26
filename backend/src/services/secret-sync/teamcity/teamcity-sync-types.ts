import { z } from "zod";

import { TTeamCityConnection } from "@app/services/app-connection/teamcity";

import { CreateTeamCitySyncSchema, TeamCitySyncListItemSchema, TeamCitySyncSchema } from "./teamcity-sync-schemas";

export type TTeamCitySync = z.infer<typeof TeamCitySyncSchema>;

export type TTeamCitySyncInput = z.infer<typeof CreateTeamCitySyncSchema>;

export type TTeamCitySyncListItem = z.infer<typeof TeamCitySyncListItemSchema>;

export type TTeamCitySyncWithCredentials = TTeamCitySync & {
  connection: TTeamCityConnection;
};

export type TTeamCityVariable = {
  name: string;
  value: string;
  inherited?: boolean;
  type: {
    rawValue: string;
  };
};

export type TTeamCityListVariablesResponse = {
  property: (TTeamCityVariable & { value?: string })[];
  count: number;
  href: string;
};

export type TTeamCityListVariables = {
  accessToken: string;
  instanceUrl: string;
  project: string;
  buildConfig?: string;
};

export type TPostTeamCityVariable = TTeamCityListVariables & {
  key: string;
  value: string;
};

export type TDeleteTeamCityVariable = TTeamCityListVariables & {
  key: string;
};
