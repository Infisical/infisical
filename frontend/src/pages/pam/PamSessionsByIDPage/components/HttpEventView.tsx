import { useMemo, useState } from "react";
import { faChevronDown, faChevronUp, faMagnifyingGlass } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";

import { Input } from "@app/components/v2";
import { HighlightText } from "@app/components/v2/HighlightText";
import { THttpEvent } from "@app/hooks/api/pam";

type Props = {
  events: THttpEvent[];
};

export const HttpEventView = ({ events }: Props) => {
  const [search, setSearch] = useState("");
  const [expandedSections, setExpandedSections] = useState<
    Record<string, { headers: boolean; body: boolean }>
  >({});

  const getContentType = (headers: Record<string, string[]>): string | undefined => {
    const contentTypeKey = Object.keys(headers).find((key) => key.toLowerCase() === "content-type");
    return contentTypeKey ? headers[contentTypeKey]?.[0] : undefined;
  };

  const decodeBase64Body = (body: string): string => {
    try {
      return atob(body);
    } catch {
      // If base64 decoding fails, return original body
      return body;
    }
  };

  const parseBodyForSearch = (
    body: string | undefined,
    headers: Record<string, string[]>
  ): string => {
    if (!body) return "";

    // Decode base64 first
    const decodedBody = decodeBase64Body(body);

    const contentType = getContentType(headers);
    const isJson = contentType?.toLowerCase().includes("application/json");

    if (isJson) {
      try {
        const parsed = JSON.parse(decodedBody);
        return JSON.stringify(parsed);
      } catch {
        // If JSON parsing fails, fall back to decoded body
        return decodedBody;
      }
    }

    return decodedBody;
  };

  const filteredEvents = useMemo(
    () =>
      events.filter((event) => {
        const searchValue = search.trim().toLowerCase();
        if (!searchValue) return true;

        if (event.eventType === "request") {
          const bodyForSearch = parseBodyForSearch(event.body, event.headers);
          return (
            event.method.toLowerCase().includes(searchValue) ||
            event.url.toLowerCase().includes(searchValue) ||
            event.requestId.toLowerCase().includes(searchValue) ||
            Object.keys(event.headers).some((key) => key.toLowerCase().includes(searchValue)) ||
            Object.values(event.headers).some((values) =>
              values.some((value) => value.toLowerCase().includes(searchValue))
            ) ||
            bodyForSearch.toLowerCase().includes(searchValue)
          );
        }
        return (
          event.status.toLowerCase().includes(searchValue) ||
          event.requestId.toLowerCase().includes(searchValue) ||
          Object.keys(event.headers).some((key) => key.toLowerCase().includes(searchValue)) ||
          Object.values(event.headers).some((values) =>
            values.some((value) => value.toLowerCase().includes(searchValue))
          )
        );
      }),
    [events, search]
  );

  const formatHeaders = (headers: Record<string, string[]>) => {
    return Object.entries(headers)
      .map(([key, values]) => `${key}: ${values.join(", ")}`)
      .join("\n");
  };

  const formatBody = (body: string | undefined, headers: Record<string, string[]>): string => {
    if (!body) {
      return "";
    }

    // Decode base64 first
    const decodedBody = decodeBase64Body(body);

    const contentType = getContentType(headers);
    const isJson = contentType?.toLowerCase().includes("application/json");

    if (isJson) {
      try {
        const parsed = JSON.parse(decodedBody);
        return JSON.stringify(parsed, null, 2);
      } catch {
        // If JSON parsing fails, return decoded body
        return decodedBody;
      }
    }

    // For non-JSON content, return decoded body
    return decodedBody;
  };

  const getKubectlCommand = (headers: Record<string, string[]>) => {
    const headerKey = Object.keys(headers).find((key) => key.toLowerCase() === "kubectl-command");
    return headerKey ? headers[headerKey]?.[0] : undefined;
  };

  const toggleSection = (eventKey: string, section: "headers" | "body") => {
    setExpandedSections((prev) => ({
      ...prev,
      [eventKey]: {
        ...prev[eventKey],
        [section]: !prev[eventKey]?.[section]
      }
    }));
  };

  const isSectionExpanded = (eventKey: string, section: "headers" | "body") => {
    return expandedSections[eventKey]?.[section] ?? false;
  };

  return (
    <>
      <div className="flex gap-2">
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          leftIcon={<FontAwesomeIcon icon={faMagnifyingGlass} />}
          placeholder="Search HTTP events..."
          className="flex-1 bg-mineshaft-800"
          containerClassName="bg-transparent"
        />
      </div>

      <div className="flex grow flex-col gap-2 overflow-y-auto text-xs">
        {filteredEvents.length > 0 ? (
          filteredEvents.map((event, index) => {
            const eventKey = `${event.timestamp}-${event.requestId}-${index}`;
            const isRequest = event.eventType === "request";
            const kubectlCommand = getKubectlCommand(event.headers);

            return (
              <div
                key={eventKey}
                className="flex w-full flex-col rounded-md border border-mineshaft-700 bg-mineshaft-800 p-3"
              >
                <div className="flex items-center justify-between text-bunker-400">
                  <div className="flex items-center gap-2 text-xs">
                    <span
                      className={`px-2 py-0.5 rounded ${
                        isRequest
                          ? "bg-blue-500/20 text-blue-400"
                          : "bg-green-500/20 text-green-400"
                      }`}
                    >
                      {isRequest ? "REQUEST" : "RESPONSE"}
                    </span>
                    {kubectlCommand && (
                      <span
                        className="px-2 py-0.5 rounded bg-purple-500/20 text-purple-400"
                        title="Kubectl Command"
                      >
                        kubectl: {kubectlCommand}
                      </span>
                    )}
                    <span>{new Date(event.timestamp).toLocaleString()}</span>
                    <span className="text-bunker-500">•</span>
                    <span className="font-mono text-xs">{event.requestId}</span>
                  </div>
                </div>

                <div className="mt-2 space-y-2">
                  {isRequest ? (
                    <div className="font-mono text-bunker-100">
                      <span className="font-semibold text-bunker-200">{event.method}</span>{" "}
                      <HighlightText text={event.url} highlight={search} />
                    </div>
                  ) : (
                    <div className="font-mono text-bunker-100">
                      <span className="font-semibold text-bunker-200">Status:</span>{" "}
                      <HighlightText text={event.status} highlight={search} />
                    </div>
                  )}

                  {Object.keys(event.headers).length > 0 && (
                    <div className="mt-2 pt-2 border-t border-mineshaft-700">
                      <button
                        type="button"
                        onClick={() => toggleSection(eventKey, "headers")}
                        className="flex items-center gap-2 w-full text-left text-bunker-400 text-xs mb-1 hover:text-bunker-300 transition-colors"
                      >
                        <FontAwesomeIcon
                          icon={
                            isSectionExpanded(eventKey, "headers") ? faChevronUp : faChevronDown
                          }
                          className="text-xs"
                        />
                        <span>Headers:</span>
                      </button>
                      {isSectionExpanded(eventKey, "headers") && (
                        <div className="font-mono whitespace-pre-wrap text-bunker-300 text-xs">
                          <HighlightText text={formatHeaders(event.headers)} highlight={search} />
                        </div>
                      )}
                    </div>
                  )}

                  {event.body && (
                    <div className="mt-2 pt-2 border-t border-mineshaft-700">
                      <button
                        type="button"
                        onClick={() => toggleSection(eventKey, "body")}
                        className="flex items-center gap-2 w-full text-left text-bunker-400 text-xs mb-1 hover:text-bunker-300 transition-colors"
                      >
                        <FontAwesomeIcon
                          icon={isSectionExpanded(eventKey, "body") ? faChevronUp : faChevronDown}
                          className="text-xs"
                        />
                        <span>Body:</span>
                      </button>
                      {isSectionExpanded(eventKey, "body") && (
                        <div className="font-mono whitespace-pre-wrap text-bunker-300 text-xs">
                          <HighlightText
                            text={formatBody(event.body, event.headers)}
                            highlight={search}
                          />
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>
            );
          })
        ) : (
          <div className="flex grow items-center justify-center text-bunker-300">
            {search.length ? (
              <div className="text-center">
                <div className="mb-2">No HTTP events match search criteria</div>
              </div>
            ) : (
              <div className="text-center">
                <div className="mb-2">HTTP session logs are not yet available</div>
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
