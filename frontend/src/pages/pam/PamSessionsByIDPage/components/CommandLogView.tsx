import { useEffect, useMemo, useRef, useState } from "react";
import { faChevronRight, faMagnifyingGlass } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { twMerge } from "tailwind-merge";

import { createNotification } from "@app/components/notifications";
import { Input } from "@app/components/v2";
import { HighlightText } from "@app/components/v2/HighlightText";
import { TPamCommandLog } from "@app/hooks/api/pam";

import { formatLogContent } from "./PamSessionLogsSection.utils";

type Props = {
  logs: TPamCommandLog[];
  scrollToLogIndex?: number;
};

export const CommandLogView = ({ logs, scrollToLogIndex }: Props) => {
  const [expandedLogTimestamps, setExpandedLogTimestamps] = useState<Set<string>>(new Set());
  const [search, setSearch] = useState("");
  const handledScrollIndexRef = useRef<number | undefined>(undefined);

  useEffect(() => {
    if (scrollToLogIndex == null) {
      handledScrollIndexRef.current = undefined;
      return;
    }
    if (scrollToLogIndex === handledScrollIndexRef.current) return;
    const target = logs[scrollToLogIndex - 1];
    if (!target) {
      handledScrollIndexRef.current = scrollToLogIndex;
      createNotification({
        type: "info",
        text: "Log entry not yet loaded. Load more logs to jump to this entry."
      });
      return;
    }
    handledScrollIndexRef.current = scrollToLogIndex;
    setSearch("");
    setExpandedLogTimestamps(new Set([target.timestamp]));
    setTimeout(() => {
      document
        .getElementById(`log-${scrollToLogIndex}`)
        ?.scrollIntoView({ behavior: "smooth", block: "center" });
    }, 50);
  }, [scrollToLogIndex, logs]);

  const toggleExpand = (timestamp: string) => {
    setExpandedLogTimestamps((prev) => {
      if (prev.has(timestamp)) {
        return new Set();
      }
      return new Set([timestamp]);
    });
  };

  const filteredLogs = useMemo(
    () =>
      logs.filter((log) => {
        const searchValue = search.trim().toLowerCase();
        return (
          log.input.toLowerCase().includes(searchValue) ||
          log.output.toLowerCase().includes(searchValue)
        );
      }),
    [logs, search]
  );

  return (
    <>
      <div className="flex gap-2">
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          leftIcon={<FontAwesomeIcon icon={faMagnifyingGlass} />}
          placeholder="Search logs..."
          className="flex-1 bg-mineshaft-800"
          containerClassName="bg-transparent"
        />
      </div>

      <div className="flex grow flex-col gap-2 overflow-y-auto text-xs">
        {filteredLogs.length > 0 ? (
          filteredLogs.map((log) => {
            const originalIndex = logs.indexOf(log) + 1;
            const isExpanded = search.length || expandedLogTimestamps.has(log.timestamp);
            const formattedInput = formatLogContent(log.input);
            const logKey = `${log.timestamp}-${originalIndex}`;

            return (
              <button
                type="button"
                id={`log-${originalIndex}`}
                key={logKey}
                className={`flex w-full flex-col rounded-md border border-mineshaft-700 p-3 text-left focus:inset-ring-2 focus:inset-ring-mineshaft-400 focus:outline-hidden ${
                  isExpanded ? "bg-mineshaft-700" : "bg-mineshaft-800 hover:bg-mineshaft-700"
                }`}
                onClick={() => toggleExpand(log.timestamp)}
              >
                <div className="flex items-center justify-between text-bunker-400">
                  <div className="flex items-center gap-2 select-none">
                    <FontAwesomeIcon
                      icon={faChevronRight}
                      className={twMerge(
                        "size-3 transition-transform duration-100 ease-in-out",
                        isExpanded && "rotate-90"
                      )}
                    />
                    <span>{new Date(log.timestamp).toLocaleString()}</span>
                  </div>
                </div>

                <div
                  className={`mt-2 font-mono ${
                    isExpanded ? "break-all whitespace-pre-wrap" : "truncate"
                  }`}
                >
                  <HighlightText text={formattedInput} highlight={search} />
                </div>

                <div
                  className={twMerge(
                    "grid transition-all duration-100 ease-in-out",
                    isExpanded && log.output ? "grid-rows-[1fr]" : "grid-rows-[0fr]"
                  )}
                >
                  <div className="overflow-hidden">
                    {log.output && (
                      <div className="pt-2 text-bunker-300">
                        <HighlightText text={log.output} highlight={search} />
                      </div>
                    )}
                  </div>
                </div>
              </button>
            );
          })
        ) : (
          <div className="flex grow items-center justify-center text-bunker-300">
            {search.length ? (
              <div className="text-center">
                <div className="mb-2">No logs match search criteria</div>
              </div>
            ) : (
              <div className="text-center">
                <div className="mb-2">Session logs are not yet available</div>
                <div className="text-xs text-bunker-400">
                  Logs will be uploaded after the session duration has elapsed.
                  <br />
                  If logs do not appear after some time, please contact your Gateway administrators.
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </>
  );
};
