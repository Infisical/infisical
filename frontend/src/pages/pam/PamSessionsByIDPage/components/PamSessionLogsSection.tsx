import { ExternalLinkIcon, Loader2Icon } from "lucide-react";

import { Button } from "@app/components/v3";
import {
  PamResourceType,
  PamSessionStatus,
  THttpEvent,
  TPamCommandLog,
  TPamSession,
  TTerminalEvent,
  useGetPamSessionLogs
} from "@app/hooks/api/pam";
import { useDecryptedSessionLogs } from "@app/hooks/api/pam/session-playback";

import { CommandLogView } from "./CommandLogView";
import { HttpEventView } from "./HttpEventView";
import { TerminalEventView } from "./TerminalEventView";

type Props = {
  session: TPamSession;
  scrollToLogIndex?: number;
};

export const PamSessionLogsSection = ({ session, scrollToLogIndex }: Props) => {
  const isActive =
    session.status === PamSessionStatus.Active || session.status === PamSessionStatus.Starting;

  const playback = useDecryptedSessionLogs(session.id, true);
  const isLegacyOrNoChunks = playback.legacy || (!playback.loading && playback.totalChunks === 0);

  const legacy = useGetPamSessionLogs(session.id, isActive, isLegacyOrNoChunks);

  const logs = isLegacyOrNoChunks ? legacy.logs : (playback.events as typeof legacy.logs);
  const isLoading = isLegacyOrNoChunks ? legacy.isLoading : playback.loading;
  const hasMore = isLegacyOrNoChunks ? legacy.hasMore : false;
  const loadMore = isLegacyOrNoChunks ? legacy.loadMore : () => {};
  const isLoadingMore = isLegacyOrNoChunks ? legacy.isLoadingMore : false;

  const isSSHSession = session.resourceType === PamResourceType.SSH;
  const isDatabaseSession =
    session.resourceType === PamResourceType.Postgres ||
    session.resourceType === PamResourceType.MySQL ||
    session.resourceType === PamResourceType.MsSQL ||
    session.resourceType === PamResourceType.MongoDB ||
    session.resourceType === PamResourceType.Redis ||
    session.resourceType === PamResourceType.OracleDB;
  const isHttpSession = session.resourceType === PamResourceType.Kubernetes;
  const isAwsIamSession = session.resourceType === PamResourceType.AwsIam;
  const hasLogs = logs.length > 0;

  return (
    <div className="flex h-full w-full flex-col gap-4 rounded-lg border border-border bg-container p-4">
      <div className="flex items-center gap-3 border-b border-border pb-4">
        <h3 className="text-lg font-medium text-foreground">Session Logs</h3>
        {isActive && (
          <span className="flex animate-pulse items-center gap-1.5 rounded-full bg-success/10 px-2.5 py-1 text-xs font-medium text-success">
            <span className="size-1.5 animate-pulse rounded-full bg-success" />
            LIVE
          </span>
        )}
      </div>

      {isLoading && !hasLogs && (
        <div className="flex grow items-center justify-center">
          <div className="flex items-center gap-2 text-sm text-muted">
            <Loader2Icon className="size-4 animate-spin" />
            <span>Fetching and decrypting logs...</span>
          </div>
        </div>
      )}

      {isDatabaseSession && hasLogs && (
        <CommandLogView logs={logs as TPamCommandLog[]} scrollToLogIndex={scrollToLogIndex} />
      )}
      {isSSHSession && hasLogs && <TerminalEventView events={logs as TTerminalEvent[]} />}
      {isHttpSession && hasLogs && <HttpEventView events={logs as THttpEvent[]} />}
      {isAwsIamSession && (
        <div className="flex grow items-center justify-center text-muted">
          <div className="text-center">
            <div className="mb-2">AWS Console session activity is logged in AWS CloudTrail</div>
            <div className="text-xs text-muted">
              View detailed activity logs for this session in your AWS CloudTrail console.
              <br />
              <a
                href="https://console.aws.amazon.com/cloudtrail"
                target="_blank"
                rel="noopener noreferrer"
                className="mt-2 inline-flex items-center gap-1 text-info hover:text-info/80"
              >
                Open AWS CloudTrail
                <ExternalLinkIcon className="size-3" />
              </a>
            </div>
          </div>
        </div>
      )}
      {!hasLogs && !isAwsIamSession && !isLoading && (
        <div className="flex grow items-center justify-center text-muted">
          <div className="text-center">
            <div className="mb-2">Session logs are not yet available</div>
            <div className="text-xs text-muted">
              Logs will be uploaded after the session duration has elapsed.
              <br />
              If logs do not appear after some time, please contact your Gateway administrators.
            </div>
          </div>
        </div>
      )}

      {!isActive && hasMore && !isAwsIamSession && (
        <div className="flex justify-center pt-2">
          <Button variant="outline" size="xs" isPending={isLoadingMore} onClick={loadMore}>
            Load more
          </Button>
        </div>
      )}
    </div>
  );
};
