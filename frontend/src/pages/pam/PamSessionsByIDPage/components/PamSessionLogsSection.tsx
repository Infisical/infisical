import { useState } from "react";
import { faChevronDown, faChevronRight } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";

import { TPamSession } from "@app/hooks/api/pam";

type Props = {
  session: TPamSession;
};

export const PamSessionLogsSection = ({ session }: Props) => {
  const [expandedLogTimestamps, setExpandedLogTimestamps] = useState<Set<string>>(new Set());

  const toggleExpand = (timestamp: string) => {
    setExpandedLogTimestamps((prev) => {
      const newSet = new Set(prev);
      if (newSet.has(timestamp)) {
        newSet.delete(timestamp);
      } else {
        newSet.add(timestamp);
      }
      return newSet;
    });
  };

  return (
    <div className="border-mineshaft-600 bg-mineshaft-900 flex h-full w-full flex-col gap-4 rounded-lg border p-4">
      <div className="border-mineshaft-400 flex items-center border-b pb-4">
        <h3 className="text-mineshaft-100 text-lg font-medium">Session Logs</h3>
      </div>
      <div className="flex flex-col gap-2 overflow-y-auto text-xs">
        {session.commandLogs.length > 0 ? (
          session.commandLogs.map((log) => {
            const isExpanded = expandedLogTimestamps.has(log.timestamp);
            return (
              <button
                type="button"
                key={log.timestamp}
                className={`border-mineshaft-700 focus:ring-mineshaft-400 focus:outline-hidden flex w-full flex-col rounded-md border p-3 text-left focus:ring-2 ${
                  isExpanded ? "bg-mineshaft-700" : "bg-mineshaft-800 hover:bg-mineshaft-700"
                }`}
                onClick={() => toggleExpand(log.timestamp)}
              >
                <div className="text-bunker-400 flex items-center justify-between">
                  <div className="flex select-none items-center gap-2">
                    <FontAwesomeIcon
                      icon={isExpanded ? faChevronDown : faChevronRight}
                      className="size-3 transition-transform duration-200"
                    />
                    <span>{new Date(log.timestamp).toLocaleString()}</span>
                  </div>
                </div>

                <div
                  className={`mt-2 font-mono ${
                    isExpanded ? "whitespace-pre-wrap break-all" : "truncate"
                  }`}
                >
                  {log.input}
                </div>

                {isExpanded && log.output && (
                  <div className="border-mineshaft-700 text-bunker-300 mt-2 whitespace-pre-wrap break-all border-t pt-2 font-mono">
                    {log.output}
                  </div>
                )}
              </button>
            );
          })
        ) : (
          <div className="text-bunker-300 flex w-full grow items-center justify-center">
            {session.startedAt && session.endedAt ? (
              <div className="text-center">
                <div className="mb-2">Session logs are not yet available</div>
                <div className="text-bunker-400 text-xs">
                  Logs will be uploaded after the session duration has elapsed.
                  <br />
                  If logs do not appear after some time, please contact your Gateway administrators.
                </div>
              </div>
            ) : (
              "No session logs"
            )}
          </div>
        )}
      </div>
    </div>
  );
};
