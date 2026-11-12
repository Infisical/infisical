import type { SecretSync } from "@app/hooks/api/secretSyncs/enums";

import { CORE_SYNC_VIEWS } from "./destination-fields";
import { AUTOMATION_SYNC_VIEWS } from "./destinations-automation";
import { CLOUD_SYNC_VIEWS } from "./destinations-cloud";
import { DATA_SYNC_VIEWS } from "./destinations-data";
import { DEPLOY_SYNC_VIEWS } from "./destinations-deploy";
import { GIT_SYNC_VIEWS } from "./destinations-git";
import { HOSTING_SYNC_VIEWS } from "./destinations-hosting";
import { VAULTS_SYNC_VIEWS } from "./destinations-vaults";
import type { SyncView } from "./sync-fields";

export const SYNC_VIEWS: Record<SecretSync, SyncView> = {
  ...CORE_SYNC_VIEWS,
  ...CLOUD_SYNC_VIEWS,
  ...DATA_SYNC_VIEWS,
  ...VAULTS_SYNC_VIEWS,
  ...GIT_SYNC_VIEWS,
  ...DEPLOY_SYNC_VIEWS,
  ...HOSTING_SYNC_VIEWS,
  ...AUTOMATION_SYNC_VIEWS
};
