import { faTerminal } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";

import { TPamSession } from "@app/hooks/api/pam";

type Props = {
  session: TPamSession;
};

export const PamSessionLogsSection = ({ session }: Props) => {
  return (
    <div className="flex h-full flex-col gap-4 rounded-lg border border-mineshaft-600 bg-mineshaft-900 p-4">
      <div className="flex items-center border-b border-mineshaft-400 pb-4">
        <h3 className="text-lg font-semibold text-mineshaft-100">Session Logs</h3>
      </div>
      <div className="flex grow flex-col gap-8 overflow-y-auto text-xs">
        {session.commandLogs.length > 0 ? (
          session.commandLogs.map((log) => (
            <div key={log.timestamp} className="flex flex-col">
              <div className="flex items-center gap-1.5 text-bunker-400">
                <FontAwesomeIcon icon={faTerminal} className="size-3" />
                <span>{new Date(log.timestamp).toLocaleString()}</span>
              </div>

              <div className="overflow-hidden whitespace-pre-wrap break-all font-mono">
                {log.input}
              </div>
              <div className="overflow-hidden whitespace-pre-wrap break-all font-mono text-bunker-300">
                {log.output}
              </div>
            </div>
          ))
        ) : (
          <div className="flex w-full grow items-center justify-center text-bunker-300">
            No session logs
          </div>
        )}
      </div>
    </div>
  );
};
