import { TKmsServiceFactory } from "@app/services/kms/kms-service";
import { TMicrosoftTeamsServiceFactory } from "@app/services/microsoft-teams/microsoft-teams-service";
import { TProjectMicrosoftTeamsConfigDALFactory } from "@app/services/microsoft-teams/project-microsoft-teams-config-dal";
import { TProjectDALFactory } from "@app/services/project/project-dal";
import { TProjectSlackConfigDALFactory } from "@app/services/slack/project-slack-config-dal";

export enum TriggerFeature {
  SECRET_APPROVAL = "secret-approval",
  ACCESS_REQUEST = "access-request",
  ACCESS_REQUEST_UPDATED = "access-request-updated",
  SECRET_SYNC_ERROR = "secret-sync-error"
}

export type TNotification =
  | {
      type: TriggerFeature.SECRET_APPROVAL;
      payload: {
        userEmail: string;
        environment: string;
        secretPath: string;
        requestId: string;
        projectId: string;
        secretKeys: string[];
      };
    }
  | {
      type: TriggerFeature.ACCESS_REQUEST;
      payload: {
        requesterFullName: string;
        requesterEmail: string;
        isTemporary: boolean;
        secretPath: string;
        environment: string;
        projectName: string;
        permissions: string[];
        approvalUrl: string;
        note?: string;
      };
    }
  | {
      type: TriggerFeature.ACCESS_REQUEST_UPDATED;
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
      };
    }
  | {
      type: TriggerFeature.SECRET_SYNC_ERROR;
      payload: {
        syncName: string;
        syncActionLabel: string;
        syncDestination: string;
        failureMessage: string;
        syncUrl: string;
      };
    };

export type TTriggerWorkflowNotificationDTO = {
  input: {
    projectId: string;
    notification: TNotification;
  };
  dependencies: {
    projectDAL: Pick<TProjectDALFactory, "findById">;
    projectSlackConfigDAL: Pick<TProjectSlackConfigDALFactory, "getIntegrationDetailsByProject">;
    projectMicrosoftTeamsConfigDAL: Pick<TProjectMicrosoftTeamsConfigDALFactory, "getIntegrationDetailsByProject">;
    kmsService: Pick<TKmsServiceFactory, "createCipherPairWithDataKey">;
    microsoftTeamsService: Pick<TMicrosoftTeamsServiceFactory, "sendNotification">;
  };
};
