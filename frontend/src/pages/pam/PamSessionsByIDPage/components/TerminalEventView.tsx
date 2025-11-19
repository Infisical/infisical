import { useMemo, useState } from "react";
import { faMagnifyingGlass } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";

import { Input } from "@app/components/v2";
import { HighlightText } from "@app/components/v2/HighlightText";
import { TTerminalEvent } from "@app/hooks/api/pam";

import { aggregateTerminalEvents } from "./terminal-utils";

type Props = {
  events: TTerminalEvent[];
};

export const TerminalEventView = ({ events }: Props) => {
  const [search, setSearch] = useState("");

  const aggregatedEvents = useMemo(() => aggregateTerminalEvents(events), [events]);

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
        {filteredEvents.length > 0 ? (
          filteredEvents.map((event, index) => {
            const eventKey = `${event.timestamp}-${index}`;

            return (
              <div
                key={eventKey}
                className="flex w-full flex-col rounded-md border border-mineshaft-700 bg-mineshaft-800 p-3"
              >
                <div className="flex items-center justify-between text-bunker-400">
                  <div className="flex items-center gap-2 text-xs">
                    <span>{new Date(event.timestamp).toLocaleString()}</span>
                  </div>
                </div>

                <div className="mt-2 font-mono whitespace-pre-wrap text-bunker-100">
                  <HighlightText text={event.data} highlight={search} />
                </div>
              </div>
            );
          })
        ) : (
          <div className="flex grow items-center justify-center text-bunker-300">
            {search.length ? (
              <div className="text-center">
                <div className="mb-2">No terminal output matches search criteria</div>
              </div>
            ) : (
              <div className="text-center">
                <div className="mb-2">Terminal session logs are not yet available</div>
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
