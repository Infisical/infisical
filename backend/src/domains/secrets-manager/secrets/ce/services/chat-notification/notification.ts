import { SecretsChatNotificationType } from "../../models/secrets-chat-event";

export type TSecretsChatNotification =
  | {
      type: SecretsChatNotificationType.SecretApproval;
      payload: {
        userEmail?: string;
        machineIdentityId?: string;
        environment: string;
        secretPath: string;
        requestId: string;
        projectId: string;
        projectName: string;
        secretKeys: string[];
        approvalUrl: string;
      };
    }
  | {
      type: SecretsChatNotificationType.AccessRequest;
      payload: {
        requesterFullName: string;
        requesterEmail: string;
        isTemporary: boolean;
        secretPath: string;
        environment: string;
        projectName: string;
        projectPath: string;
        permissions: string[];
        approvalUrl: string;
        note?: string;
      };
    }
  | {
      type: SecretsChatNotificationType.AccessRequestUpdated;
      payload: {
        requesterFullName: string;
        requesterEmail: string;
        isTemporary: boolean;
        secretPath: string;
        environment: string;
        projectName: string;
        permissions: string[];
        approvalUrl: string;
        editNote?: string;
        editorFullName?: string;
        editorEmail?: string;
        projectPath: string;
      };
    }
  | {
      type: SecretsChatNotificationType.SecretSyncError;
      payload: {
        syncName: string;
        syncActionLabel: string;
        syncDestination: string;
        failureMessage: string;
        syncUrl: string;
        environment: string;
        secretPath: string;
        projectName: string;
        projectPath: string;
      };
    };
