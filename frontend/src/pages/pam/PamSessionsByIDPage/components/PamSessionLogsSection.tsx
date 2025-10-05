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
    <div className="flex h-full w-full flex-col gap-4 rounded-lg border border-mineshaft-600 bg-mineshaft-900 p-4">
      <div className="flex items-center border-b border-mineshaft-400 pb-4">
        <h3 className="text-lg font-semibold text-mineshaft-100">Session Logs</h3>
      </div>
      <div className="flex flex-col gap-2 overflow-y-auto text-xs">
        {session.commandLogs.length > 0 ? (
          session.commandLogs.map((log) => {
            const isExpanded = expandedLogTimestamps.has(log.timestamp);
            return (
              <button
                type="button"
                key={log.timestamp}
                className={`flex w-full flex-col rounded-md border border-mineshaft-700 p-3 text-left focus:outline-none focus:ring-2 focus:ring-mineshaft-400 ${
                  isExpanded ? "bg-mineshaft-700" : "bg-mineshaft-800 hover:bg-mineshaft-700"
                }`}
                onClick={() => toggleExpand(log.timestamp)}
              >
                <div className="flex items-center justify-between text-bunker-400">
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
                  <div className="mt-2 whitespace-pre-wrap break-all border-t border-mineshaft-700 pt-2 font-mono text-bunker-300">
                    {log.output}
                  </div>
                )}
              </button>
            );
          })
        ) : (
          <div className="flex w-full grow items-center justify-center text-bunker-300">
            No session logs
          </div>
        )}
      </div>
    </div>
  );
};
