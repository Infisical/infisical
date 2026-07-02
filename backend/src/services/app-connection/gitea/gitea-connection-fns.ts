import { AppConnection } from "../app-connection-enums";
import { GiteaConnectionMethod } from "./gitea-connection-enums";

export const getGiteaConnectionListItem = () => {
  return {
    name: "Gitea" as const,
    app: AppConnection.Gitea as const,
    methods: Object.values(GiteaConnectionMethod) as [GiteaConnectionMethod.AccessToken]
  };
};
