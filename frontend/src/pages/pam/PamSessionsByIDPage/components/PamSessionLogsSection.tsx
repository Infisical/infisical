import { useState } from "react";
import { faChevronDown, faChevronRight } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";

import { TPamSession } from "@app/hooks/api/pam";
import { PamSessionLogOutput } from "./PamSessionLogOutput";
import { formatLogContent } from "./PamSessionLogsSection.utils";

type Props = {
  session: TPamSession;
};

export const PamSessionLogsSection = ({ session }: Props) => {
  const [expandedLogTimestamps, setExpandedLogTimestamps] = useState<Set<string>>(new Set());

  const toggleExpand = (timestamp: string) => {
    setExpandedLogTimestamps((prev) => {
      if (prev.has(timestamp)) {
        return new Set();
      }
      return new Set([timestamp]);
    });
  };

  return (
    <div className="flex h-full w-full flex-col gap-4 rounded-lg border border-mineshaft-600 bg-mineshaft-900 p-4">
      <div className="flex items-center border-b border-mineshaft-400 pb-4">
        <h3 className="text-lg font-medium text-mineshaft-100">Session Logs</h3>
      </div>
      <div className="flex flex-col gap-2 overflow-y-auto text-xs">
        {session.commandLogs.length > 0 ? (
          session.commandLogs.map((log) => {
            const isExpanded = expandedLogTimestamps.has(log.timestamp);
            const formattedInput = formatLogContent(log.input);

            return (
              <button
                type="button"
                key={log.timestamp}
                className={`flex w-full flex-col rounded-md border border-mineshaft-700 p-3 text-left focus:inset-ring-2 focus:inset-ring-mineshaft-400 focus:outline-hidden ${
                  isExpanded ? "bg-mineshaft-700" : "bg-mineshaft-800 hover:bg-mineshaft-700"
                }`}
                onClick={() => toggleExpand(log.timestamp)}
              >
                <div className="flex items-center justify-between text-bunker-400">
                  <div className="flex items-center gap-2 select-none">
                    <FontAwesomeIcon
                      icon={isExpanded ? faChevronDown : faChevronRight}
                      className="size-3 transition-transform duration-200"
                    />
                    <span>{new Date(log.timestamp).toLocaleString()}</span>
                  </div>
                </div>

                <div
                  className={`mt-2 font-mono ${
                    isExpanded ? "break-all whitespace-pre-wrap" : "truncate"
                  }`}
                >
                  {formattedInput}
                </div>

                {isExpanded && log.output && (
                  <>
                    <div className="mt-2 flex items-center gap-2">
                      <div className="h-px w-full bg-mineshaft-400"></div>
                      <span className="text-xs text-mineshaft-400">OUTPUT</span>
                      <div className="h-px w-full bg-mineshaft-400"></div>
                    </div>
                    <div className="pt-2 text-bunker-300">
                      <PamSessionLogOutput content={log.output} />
                    </div>
                  </>
                )}
              </button>
            );
          })
        ) : (
          <div className="flex w-full grow items-center justify-center text-bunker-300">
            {session.startedAt && session.endedAt ? (
              <div className="text-center">
                <div className="mb-2">Session logs are not yet available</div>
                <div className="text-xs text-bunker-400">
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
