import { PamResourceType, TPamCommandLog, TPamSession, TTerminalEvent } from "@app/hooks/api/pam";

import { CommandLogView } from "./CommandLogView";
import { TerminalEventView } from "./TerminalEventView";

type Props = {
  session: TPamSession;
};

export const PamSessionLogsSection = ({ session }: Props) => {
  // Determine log type based on resource type
  const isSSHSession = session.resourceType === PamResourceType.SSH;
  const isDatabaseSession =
    session.resourceType === PamResourceType.Postgres ||
    session.resourceType === PamResourceType.MySQL;
  const hasLogs = session.logs.length > 0;

  return (
    <div className="flex h-full w-full flex-col gap-4 rounded-lg border border-mineshaft-600 bg-mineshaft-900 p-4">
      <div className="flex items-center border-b border-mineshaft-400 pb-4">
        <h3 className="text-lg font-medium text-mineshaft-100">Session Logs</h3>
      </div>

      {isDatabaseSession && hasLogs && <CommandLogView logs={session.logs as TPamCommandLog[]} />}
      {isSSHSession && hasLogs && <TerminalEventView events={session.logs as TTerminalEvent[]} />}
      {!hasLogs && (
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
    </div>
  );
};
