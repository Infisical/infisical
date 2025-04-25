import z from "zod";

import { DiscriminativePick } from "@app/lib/types";

import { AppConnection } from "../app-connection-enums";
import {
  CreateTeamCityConnectionSchema,
  TeamCityConnectionSchema,
  ValidateTeamCityConnectionCredentialsSchema
} from "./teamcity-connection-schemas";

export type TTeamCityConnection = z.infer<typeof TeamCityConnectionSchema>;

export type TTeamCityConnectionInput = z.infer<typeof CreateTeamCityConnectionSchema> & {
  app: AppConnection.TeamCity;
};

export type TValidateTeamCityConnectionCredentialsSchema = typeof ValidateTeamCityConnectionCredentialsSchema;

export type TTeamCityConnectionConfig = DiscriminativePick<
  TTeamCityConnectionInput,
  "method" | "app" | "credentials"
> & {
  orgId: string;
};

export type TTeamCityProject = {
  id: string;
  name: string;
};

export type TTeamCityProjectWithBuildTypes = TTeamCityProject & {
  buildTypes: {
    buildType: {
      id: string;
      name: string;
    }[];
  };
};

export type TTeamCityListProjectsResponse = {
  project: TTeamCityProjectWithBuildTypes[];
};
