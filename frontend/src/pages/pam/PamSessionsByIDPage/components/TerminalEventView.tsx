import { useMemo, useState } from "react";
import { faMagnifyingGlass } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";

import { Input } from "@app/components/v2";
import { HighlightText } from "@app/components/v2/HighlightText";
import { TerminalChannelType, TTerminalEvent } from "@app/hooks/api/pam";
import { isBrokenChunkMarker, TBrokenChunkMarker } from "@app/hooks/api/pam/session-playback";

import { aggregateTerminalEvents } from "./terminal-utils";

const CHANNEL_LABEL_MAP: Record<string, string> = {
  [TerminalChannelType.Exec]: "Exec",
  [TerminalChannelType.Sftp]: "SFTP"
};

type Props = {
  events: (TTerminalEvent | TBrokenChunkMarker)[];
};

export const TerminalEventView = ({ events }: Props) => {
  const [search, setSearch] = useState("");

  const markers = useMemo(() => events.filter(isBrokenChunkMarker), [events]);

  const realEvents = useMemo(
    () => events.filter((e): e is TTerminalEvent => !isBrokenChunkMarker(e)),
    [events]
  );

  const aggregatedEvents = useMemo(() => aggregateTerminalEvents(realEvents), [realEvents]);

  const filteredEvents = useMemo(
    () =>
      aggregatedEvents.filter((event) => {
        const searchValue = search.trim().toLowerCase();
        if (!searchValue) return true;
        return event.data.toLowerCase().includes(searchValue);
      }),
    [aggregatedEvents, search]
  );

  return (
    <>
      <div className="flex gap-2">
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          leftIcon={<FontAwesomeIcon icon={faMagnifyingGlass} />}
          placeholder="Search terminal output..."
          className="flex-1 bg-mineshaft-800"
          containerClassName="bg-transparent"
        />
      </div>

      <div className="flex grow flex-col gap-2 overflow-y-auto text-xs">
        {markers.length > 0 && (
          <div className="flex flex-col gap-1 rounded-md border border-warning/30 bg-warning/5 px-3 py-2 text-xs text-warning">
            <span>Some terminal output may be missing due to unavailable chunks.</span>
            {markers.map((m) => (
              <span key={m.chunkIndex} className="text-warning/70">
                Chunk {m.chunkIndex}: {m.message}
              </span>
            ))}
          </div>
        )}
        {filteredEvents.length > 0 ? (
          filteredEvents.map((event, index) => {
            const eventKey = `${event.timestamp}-${index}`;

            const channelLabel = event.channelType ? CHANNEL_LABEL_MAP[event.channelType] : null;

            return (
              <div
                key={eventKey}
                className="flex w-full flex-col rounded-md border border-border bg-card p-3"
              >
                <div className="flex items-center justify-between text-muted">
                  <div className="flex items-center gap-2 text-xs">
                    <span>{new Date(event.timestamp).toLocaleString()}</span>
                    {channelLabel && (
                      <span className="rounded bg-card px-1.5 py-0.5 text-label">
                        {channelLabel}
                      </span>
                    )}
                    {event.eventType === "input" && (
                      <span className="rounded bg-primary-900/30 px-1.5 py-0.5 text-primary-400">
                        Command
                      </span>
                    )}
                  </div>
                </div>

                <div className="mt-2 font-mono whitespace-pre-wrap text-foreground">
                  <HighlightText text={event.data} highlight={search} />
                </div>
              </div>
            );
          })
        ) : (
          <div className="flex grow items-center justify-center text-label">
            {search.length ? (
              <div className="text-center">
                <div className="mb-2">No terminal output matches search criteria</div>
              </div>
            ) : (
              <div className="text-center">
                <div className="mb-2">Terminal session logs are not yet available</div>
                <div className="text-xs text-muted">
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
