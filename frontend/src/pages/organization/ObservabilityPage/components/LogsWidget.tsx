import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { GripVertical, Pause, Play, Trash2 } from "lucide-react";
import { twMerge } from "tailwind-merge";

import type { LogEntry } from "../mock-data";
import { generateLogEntry, generateSeedLogs } from "../mock-data";
import { WidgetIcon } from "./WidgetIcon";

const LEVEL_COLOR: Record<string, string> = {
  error: "#f85149",
  warn: "#d29922",
  info: "#58a6ff"
};

export function LogsWidget({ dragHandleProps }: { dragHandleProps?: Record<string, unknown> }) {
  const [mounted, setMounted] = useState(false);
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [paused, setPaused] = useState(false);
  const [activeLevels, setActiveLevels] = useState(new Set(["error", "warn", "info"]));
  const [resourceFilter, setResourceFilter] = useState("");
  const [textFilter, setTextFilter] = useState("");
  const [autoScroll, setAutoScroll] = useState(true);
  const streamRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setLogs(generateSeedLogs());
    setMounted(true);
  }, []);

  const counters = useMemo(
    () => ({
      error: logs.filter((l) => l.level === "error").length,
      warn: logs.filter((l) => l.level === "warn").length,
      info: logs.filter((l) => l.level === "info").length
    }),
    [logs]
  );

  useEffect(() => {
    if (paused || !mounted) return undefined;
    const interval = setInterval(() => {
      const entry = generateLogEntry();
      setLogs((prev) => [entry, ...prev].slice(0, 200));
    }, 5000);
    return () => clearInterval(interval);
  }, [paused, mounted]);

  useEffect(() => {
    if (autoScroll && streamRef.current) {
      streamRef.current.scrollTop = 0;
    }
  }, [logs, autoScroll]);

  const toggleLevel = useCallback((level: string) => {
    setActiveLevels((prev) => {
      const next = new Set(prev);
      if (next.has(level)) next.delete(level);
      else next.add(level);
      return next;
    });
  }, []);

  const filteredLogs = useMemo(
    () =>
      logs.filter(
        (l) =>
          activeLevels.has(l.level) &&
          (!resourceFilter || l.resource === resourceFilter) &&
          (!textFilter || l.message.toLowerCase().includes(textFilter.toLowerCase()))
      ),
    [logs, activeLevels, resourceFilter, textFilter]
  );

  const fmtTs = (d: Date) => d.toISOString().slice(11, 23);

  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      {/* Header */}
      <div className="flex items-center border-b border-mineshaft-600">
        <div
          className="flex cursor-grab items-center self-stretch border-r border-mineshaft-600 px-1.5 text-mineshaft-500 transition-colors hover:bg-mineshaft-700 hover:text-mineshaft-300 active:cursor-grabbing"
          {...dragHandleProps}
          title="Drag to reorder"
        >
          <GripVertical size={14} />
        </div>
        <div className="flex flex-1 items-center justify-between px-3 py-2.5">
          <div className="flex items-center gap-2">
            <div className="flex h-[22px] w-[22px] items-center justify-center rounded-[5px] bg-[#1c2a3a]">
              <WidgetIcon name="Terminal" size={12} className="text-primary" />
            </div>
            <span className="text-[13px] font-medium text-bunker-100">Live Logs</span>
          </div>
          <div className="flex items-center gap-1.5">
            {/* Level toggles */}
            <div className="flex gap-0.5">
              {(["error", "warn", "info"] as const).map((level) => (
                <button
                  key={level}
                  type="button"
                  onClick={() => toggleLevel(level)}
                  className={twMerge(
                    "flex items-center gap-1 rounded-[5px] border px-2 py-0.5 text-[11px] font-medium transition-colors",
                    activeLevels.has(level)
                      ? "border-mineshaft-400 bg-mineshaft-600 text-white"
                      : "border-mineshaft-600 bg-mineshaft-700 text-mineshaft-400"
                  )}
                >
                  <span
                    className="h-1.5 w-1.5 rounded-full"
                    style={{ background: LEVEL_COLOR[level] }}
                  />
                  {level}
                </button>
              ))}
            </div>
            {/* Resource filter */}
            <select
              value={resourceFilter}
              onChange={(e) => setResourceFilter(e.target.value)}
              className="rounded-[5px] border border-mineshaft-600 bg-bunker-800 px-2 py-1 text-[12px] text-white outline-none"
            >
              <option value="">All resources</option>
              <option value="secret_sync">secret_sync</option>
              <option value="secret_rotation">secret_rotation</option>
              <option value="mi_token_ttl">mi_token_ttl</option>
              <option value="webhook">webhook</option>
              <option value="pam_active">pam_active</option>
              <option value="latest_login">latest_login</option>
            </select>
            {/* Text filter */}
            <input
              type="text"
              placeholder="Filter..."
              value={textFilter}
              onChange={(e) => setTextFilter(e.target.value)}
              className="w-[100px] rounded-[5px] border border-mineshaft-600 bg-bunker-800 px-2 py-1 text-[12px] text-white outline-none focus:border-primary"
            />
            {/* Pause/Resume */}
            <button
              type="button"
              onClick={() => setPaused(!paused)}
              className="flex items-center gap-1 rounded px-2 py-1 text-[11px] text-mineshaft-300 transition-colors hover:bg-mineshaft-600 hover:text-white"
            >
              {paused ? <Play size={10} /> : <Pause size={10} />}
              {paused ? "Resume" : "Pause"}
            </button>
            {/* Live indicator */}
            <span className="flex items-center gap-1 rounded border border-mineshaft-600 bg-bunker-800 px-1.5 py-0.5 text-[10px] text-mineshaft-300">
              <span
                className={twMerge(
                  "inline-block h-[5px] w-[5px] rounded-full",
                  paused ? "bg-mineshaft-400" : "animate-pulse bg-green-500"
                )}
              />
              5s
            </span>
            {/* Clear */}
            <button
              type="button"
              onClick={() => setLogs([])}
              className="flex h-[22px] w-[22px] items-center justify-center rounded text-mineshaft-300 transition-colors hover:bg-mineshaft-600 hover:text-white"
              title="Clear"
            >
              <Trash2 size={12} />
            </button>
          </div>
        </div>
      </div>

      {/* Stat bar */}
      <div className="flex gap-3 border-b border-mineshaft-600 bg-bunker-800 px-3.5 py-1.5">
        <div className="flex items-center gap-1.5 text-[11px]">
          <span className="h-1.5 w-1.5 rounded-full bg-[#f85149]" />
          <span className="text-mineshaft-300">errors</span>
          <span className="font-semibold text-[#f85149]">{counters.error}</span>
        </div>
        <div className="flex items-center gap-1.5 text-[11px]">
          <span className="h-1.5 w-1.5 rounded-full bg-[#d29922]" />
          <span className="text-mineshaft-300">warnings</span>
          <span className="font-semibold text-[#d29922]">{counters.warn}</span>
        </div>
        <div className="flex items-center gap-1.5 text-[11px]">
          <span className="h-1.5 w-1.5 rounded-full bg-[#58a6ff]" />
          <span className="text-mineshaft-300">info</span>
          <span className="font-semibold text-[#58a6ff]">{counters.info}</span>
        </div>
        <span className="ml-auto text-[11px] text-mineshaft-300">
          Scope: org - Admin Org
        </span>
      </div>

      {/* Log stream */}
      <div
        ref={streamRef}
        className="flex-1 overflow-y-auto border-t border-mineshaft-600 bg-[#0a0e14] font-mono text-[12px] leading-relaxed"
      >
        {!mounted ? (
          <div className="flex h-full items-center justify-center text-[11px] text-mineshaft-300">
            Loading logs...
          </div>
        ) : filteredLogs.length === 0 ? (
          <div className="flex h-full items-center justify-center text-[11px] text-mineshaft-300">
            No matching log entries
          </div>
        ) : (
          filteredLogs.map((entry, i) => (
            <div
              key={`${entry.ts.getTime()}-${i}`}
              className={twMerge(
                "grid grid-cols-[80px_44px_130px_120px_1fr_60px] items-center px-3.5 py-0.5 transition-colors hover:bg-mineshaft-700",
                entry.level === "error" && "border-l-2 border-l-[#f85149]",
                entry.level === "warn" && "border-l-2 border-l-[#d29922]",
                entry.level === "info" && "border-l-2 border-l-transparent"
              )}
              style={{ borderBottom: "1px solid rgba(255,255,255,0.03)" }}
            >
              <span className="text-[10px] text-[#484f58]">{fmtTs(entry.ts)}</span>
              <span
                className="text-[10px] font-bold uppercase"
                style={{ color: LEVEL_COLOR[entry.level] }}
              >
                {entry.level}
              </span>
              <span className="truncate text-[11px] text-mineshaft-300">{entry.resource}</span>
              <span className="truncate text-[11px] text-mineshaft-300">{entry.actor}</span>
              <span className="truncate text-white" title={entry.message}>
                {entry.message}
              </span>
              <a
                href="#"
                className="text-right text-[10px] text-primary opacity-0 transition-opacity hover:opacity-100"
              >
                view -&gt;
              </a>
            </div>
          ))
        )}
      </div>

      {/* Footer */}
      <div className="flex items-center justify-between border-t border-mineshaft-600 bg-bunker-800 px-3.5 py-1.5">
        <span className="text-[11px] text-mineshaft-300">{filteredLogs.length} entries</span>
        <label className="flex cursor-pointer items-center gap-1.5 text-[11px] text-mineshaft-300">
          <input
            type="checkbox"
            checked={autoScroll}
            onChange={(e) => setAutoScroll(e.target.checked)}
            className="accent-primary"
          />
          Auto-scroll
        </label>
      </div>
    </div>
  );
}
