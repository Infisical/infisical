import { TAwsConnection } from "@app/lib/app-connections/aws/aws-connection-types";
import { TGitHubConnection, TGitHubConnectionInput } from "@app/lib/app-connections/github";
import { DiscriminativePick } from "@app/lib/types";

import { AppConnection } from "./app-connection-enums";

export type AppConnectionListItem = {
  app: AppConnection;
  name: string;
  methods: string[];
};

export type TAppConnection = { id: string } & (TAwsConnection | TGitHubConnection);

export type TAppConnectionInput = { id: string } & (TAwsConnection | TGitHubConnectionInput);

export type TCreateAppConnectionDTO = Pick<TAppConnectionInput, "credentials" | "method" | "name" | "app">;

export type TUpdateAppConnectionDTO = Partial<Omit<TCreateAppConnectionDTO, "method" | "app">> & {
  connectionId: string;
};

export type TAppConnectionConfig = { orgId: string } & DiscriminativePick<
  TAppConnectionInput,
  "app" | "method" | "credentials"
>;
