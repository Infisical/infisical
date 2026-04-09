import { faUpRightFromSquare } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";

import { Button } from "@app/components/v2";
import {
  PamResourceType,
  PamSessionStatus,
  THttpEvent,
  TPamCommandLog,
  TPamSession,
  TTerminalEvent,
  useGetPamSessionLogs
} from "@app/hooks/api/pam";

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

  const { logs, isLoading, hasMore, loadMore, isLoadingMore } = useGetPamSessionLogs(
    session.id,
    isActive
  );

  const isSSHSession = session.resourceType === PamResourceType.SSH;
  const isDatabaseSession =
    session.resourceType === PamResourceType.Postgres ||
    session.resourceType === PamResourceType.MySQL ||
    session.resourceType === PamResourceType.MsSQL ||
    session.resourceType === PamResourceType.MongoDB ||
    session.resourceType === PamResourceType.Redis;
  const isHttpSession = session.resourceType === PamResourceType.Kubernetes;
  const isAwsIamSession = session.resourceType === PamResourceType.AwsIam;
  const hasLogs = logs.length > 0;

  return (
    <div className="flex h-full w-full flex-col gap-4 rounded-lg border border-mineshaft-600 bg-mineshaft-900 p-4">
      <div className="flex items-center gap-3 border-b border-mineshaft-400 pb-4">
        <h3 className="text-lg font-medium text-mineshaft-100">Session Logs</h3>
        {isActive && (
          <span className="flex animate-pulse items-center gap-1.5 rounded-full bg-green-900/40 px-2.5 py-1 text-xs font-medium text-green-400">
            <span className="size-1.5 animate-pulse rounded-full bg-green-400" />
            LIVE
          </span>
        )}
      </div>

      {isDatabaseSession && hasLogs && <CommandLogView logs={logs as TPamCommandLog[]} scrollToLogIndex={scrollToLogIndex} />}
      {isSSHSession && hasLogs && <TerminalEventView events={logs as TTerminalEvent[]} />}
      {isHttpSession && hasLogs && <HttpEventView events={logs as THttpEvent[]} />}
      {isAwsIamSession && (
        <div className="flex grow items-center justify-center text-bunker-300">
          <div className="text-center">
            <div className="mb-2">AWS Console session activity is logged in AWS CloudTrail</div>
            <div className="text-xs text-bunker-400">
              View detailed activity logs for this session in your AWS CloudTrail console.
              <br />
              <a
                href="https://console.aws.amazon.com/cloudtrail"
                target="_blank"
                rel="noopener noreferrer"
                className="mt-2 inline-flex items-center gap-1 text-primary-400 hover:text-primary-300"
              >
                Open AWS CloudTrail
                <FontAwesomeIcon icon={faUpRightFromSquare} className="size-3" />
              </a>
            </div>
          </div>
        </div>
      )}
      {!hasLogs && !isAwsIamSession && !isLoading && (
        <div className="flex grow items-center justify-center text-bunker-300">
          <div className="text-center">
            <div className="mb-2">Session logs are not yet available</div>
            <div className="text-xs text-bunker-400">
              Logs will be uploaded after the session duration has elapsed.
              <br />
              If logs do not appear after some time, please contact your Gateway administrators.
            </div>
          </div>
        </div>
      )}

      {!isActive && hasMore && !isAwsIamSession && (
        <div className="flex justify-center pt-2">
          <Button variant="outline_bg" size="xs" isLoading={isLoadingMore} onClick={loadMore}>
            Load more
          </Button>
        </div>
      )}
    </div>
  );
};
