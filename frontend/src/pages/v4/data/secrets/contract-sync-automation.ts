import type { TChecklyAccount } from "@app/hooks/api/appConnections/checkly/types";
import type { TJenkinsFolder } from "@app/hooks/api/appConnections/jenkins/types";
import type { TOnaProject } from "@app/hooks/api/appConnections/ona/types";
import type { TRundeckProject } from "@app/hooks/api/appConnections/rundeck/types";
import type {
  TTriggerDevEnvironment,
  TTriggerDevProject
} from "@app/hooks/api/appConnections/trigger-dev/types";
import type { TWindmillWorkspace } from "@app/hooks/api/appConnections/windmill/types";

import type { V4QueryResult } from "../contract";
import type { ConnectionOptions, QueryOptions } from "./contract-options";

export type SyncAutomationLookups = {
  useRundeckProjects: ConnectionOptions<TRundeckProject>;
  useWindmillWorkspaces: ConnectionOptions<TWindmillWorkspace>;
  useChecklyAccounts: ConnectionOptions<TChecklyAccount>;
  useChecklyGroups: (
    dto: { connectionId: string; accountId: string },
    options?: QueryOptions
  ) => V4QueryResult<TChecklyAccount[]>;
  useOnaProjects: ConnectionOptions<TOnaProject>;
  useTriggerDevProjects: ConnectionOptions<TTriggerDevProject>;
  useTriggerDevEnvironments: (
    dto: { connectionId: string; projectRef: string },
    options?: QueryOptions
  ) => V4QueryResult<TTriggerDevEnvironment[]>;
  useJenkinsFolders: ConnectionOptions<TJenkinsFolder>;
};
