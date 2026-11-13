import { PamResourcePermissionActions } from "@app/hooks/api/pam";

export const DEFAULT_ACCESS_DURATION = "1h";

// The virtual My Accounts folder holds every account the user can launch sessions on.
export const MY_ACCOUNTS_ACTION = PamResourcePermissionActions.LaunchSessions;
