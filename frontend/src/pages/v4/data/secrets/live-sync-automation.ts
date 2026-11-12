import {
  useChecklyConnectionListAccounts,
  useChecklyConnectionListGroups
} from "@app/hooks/api/appConnections/checkly";
import { useOnaConnectionListProjects } from "@app/hooks/api/appConnections/ona";
import { useRundeckConnectionListProjects } from "@app/hooks/api/appConnections/rundeck";
import {
  useTriggerDevConnectionListEnvironments,
  useTriggerDevConnectionListProjects
} from "@app/hooks/api/appConnections/trigger-dev";
import { useWindmillConnectionListWorkspaces } from "@app/hooks/api/appConnections/windmill";

import type { SyncAutomationLookups } from "./contract-sync-automation";

export const syncAutomationLive: SyncAutomationLookups = {
  useRundeckProjects: (connectionId, options) =>
    useRundeckConnectionListProjects(connectionId, options),
  useWindmillWorkspaces: (connectionId, options) =>
    useWindmillConnectionListWorkspaces(connectionId, options),
  useChecklyAccounts: (connectionId, options) =>
    useChecklyConnectionListAccounts(connectionId, options),
  useChecklyGroups: ({ connectionId, accountId }, options) =>
    useChecklyConnectionListGroups(connectionId, accountId, options),
  useOnaProjects: (connectionId, options) => useOnaConnectionListProjects(connectionId, options),
  useTriggerDevProjects: (connectionId, options) =>
    useTriggerDevConnectionListProjects(connectionId, options),
  useTriggerDevEnvironments: ({ connectionId, projectRef }, options) =>
    useTriggerDevConnectionListEnvironments(connectionId, projectRef, options)
};
