import { PencilIcon, SparklesIcon } from "lucide-react";

import { ProjectPermissionCan } from "@app/components/permissions";
import {
  Badge,
  Detail,
  DetailGroup,
  DetailLabel,
  DetailValue,
  IconButton
} from "@app/components/v3";
import { ProjectPermissionActions, ProjectPermissionSub } from "@app/context";
import { useListAppConnections } from "@app/hooks/api/appConnections/queries";

// SessionRecordingConfig mirrors the backend sessionSummaryConfig shape.
// connectionName is optional and derived client-side from the app connections list.
export type SessionRecordingConfig = {
  aiInsightsEnabled: boolean;
  connectionId: string;
  connectionName?: string;
  model: string;
} | null;

type Props = {
  config: SessionRecordingConfig;
  onEdit: VoidFunction;
};

export const PamResourceSessionRecordingSection = ({ config, onEdit }: Props) => {
  const { data: allConnections = [] } = useListAppConnections(undefined, {
    enabled: Boolean(config?.aiInsightsEnabled && config?.connectionId)
  });

  const connectionName =
    config?.connectionName ||
    allConnections.find((c) => c.id === config?.connectionId)?.name ||
    config?.connectionId ||
    "";

  return (
    <div className="flex w-full flex-col gap-3 rounded-lg border border-border bg-container px-4 py-3">
      <div className="flex items-center justify-between border-b border-border pb-2">
        <h3 className="text-lg font-medium">Session Recording</h3>
        <ProjectPermissionCan
          I={ProjectPermissionActions.Edit}
          a={ProjectPermissionSub.PamResources}
        >
          {(isAllowed) => (
            <IconButton variant="ghost" size="xs" onClick={onEdit} isDisabled={!isAllowed}>
              <PencilIcon />
            </IconButton>
          )}
        </ProjectPermissionCan>
      </div>

      <DetailGroup>
        <Detail>
          <DetailLabel>
            <span className="flex items-center gap-1.5">
              <SparklesIcon className="size-3.5 text-purple-400" />
              AI Insights
            </span>
          </DetailLabel>
          <DetailValue>
            {config?.aiInsightsEnabled ? (
              <Badge variant="success">Enabled</Badge>
            ) : (
              <span className="text-muted">Disabled</span>
            )}
          </DetailValue>
        </Detail>
        {config?.aiInsightsEnabled && (
          <>
            <Detail>
              <DetailLabel>App Connection</DetailLabel>
              <DetailValue>{connectionName}</DetailValue>
            </Detail>
            <Detail>
              <DetailLabel>Model</DetailLabel>
              <DetailValue>
                <code className="rounded bg-mineshaft-600 px-2 py-0.5 text-xs">{config.model}</code>
              </DetailValue>
            </Detail>
          </>
        )}
      </DetailGroup>
    </div>
  );
};
