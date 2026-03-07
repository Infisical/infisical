import { useMemo, useState } from "react";
import {
  faCamera,
  faChevronDown,
  faChevronUp,
  faFilter,
  faMagnifyingGlass
} from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";

import { Input, Modal, ModalContent, Switch } from "@app/components/v2";
import {
  THttpEvent,
  THttpRequestEvent,
  THttpResponseEvent,
  TPamSessionLog,
  TScreenshotEvent
} from "@app/hooks/api/pam";

type RequestResponsePair = {
  type: "http";
  timestamp: string;
  request: THttpRequestEvent;
  response?: THttpResponseEvent;
};

type ScreenshotEntry = {
  type: "screenshot";
  timestamp: string;
  event: TScreenshotEvent;
};

type TimelineEntry = RequestResponsePair | ScreenshotEntry;

type Props = {
  logs: TPamSessionLog[];
};

const ASSET_EXTENSIONS = /\.(css|js|png|jpg|jpeg|gif|svg|ico|woff|woff2|ttf|eot|map|webp|avif)(\?.*)?$/i;

const isAssetRequest = (url: string): boolean => {
  return ASSET_EXTENSIONS.test(url) || url.includes("__infisical_capture");
};

export const WebHttpEventView = ({ logs }: Props) => {
  const [search, setSearch] = useState("");
  const [hideAssets, setHideAssets] = useState(true);
  const [expandedPairs, setExpandedPairs] = useState<Record<string, boolean>>({});
  const [previewImage, setPreviewImage] = useState<string | null>(null);

  // Build a unified timeline of HTTP pairs + screenshots, sorted by timestamp
  const timeline = useMemo(() => {
    const entries: TimelineEntry[] = [];
    const requestMap = new Map<string, THttpRequestEvent>();

    logs.forEach((log) => {
      if ("eventType" in log) {
        if (log.eventType === "request" && "method" in log) {
          requestMap.set(log.requestId, log as THttpRequestEvent);
        } else if (log.eventType === "response" && "status" in log && "requestId" in log) {
          const req = requestMap.get((log as THttpResponseEvent).requestId);
          if (req) {
            entries.push({
              type: "http",
              timestamp: req.timestamp,
              request: req,
              response: log as THttpResponseEvent
            });
            requestMap.delete((log as THttpResponseEvent).requestId);
          }
        } else if (log.eventType === "screenshot" && "image" in log) {
          entries.push({
            type: "screenshot",
            timestamp: log.timestamp,
            event: log as TScreenshotEvent
          });
        }
      }
    });

    // Add unpaired requests
    requestMap.forEach((req) => {
      entries.push({ type: "http", timestamp: req.timestamp, request: req });
    });

    return entries.sort(
      (a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
    );
  }, [logs]);

  const filteredTimeline = useMemo(() => {
    const searchValue = search.trim().toLowerCase();

    return timeline.filter((entry) => {
      // Screenshots always show
      if (entry.type === "screenshot") return true;

      // Asset filter
      if (hideAssets && isAssetRequest(entry.request.url)) return false;

      // Search filter
      if (searchValue) {
        return (
          entry.request.method.toLowerCase().includes(searchValue) ||
          entry.request.url.toLowerCase().includes(searchValue) ||
          (entry.response?.status ?? "").toLowerCase().includes(searchValue)
        );
      }

      return true;
    });
  }, [timeline, search, hideAssets]);

  const getStatusColor = (status: string) => {
    const code = parseInt(status, 10);
    if (code >= 200 && code < 300) return "text-green-400";
    if (code >= 300 && code < 400) return "text-yellow-400";
    if (code >= 400) return "text-red-400";
    return "text-bunker-300";
  };

  const getContentType = (headers?: Record<string, string[]>) => {
    if (!headers) return undefined;
    const key = Object.keys(headers).find((k) => k.toLowerCase() === "content-type");
    return key ? headers[key]?.[0]?.split(";")?.[0] : undefined;
  };

  const togglePair = (id: string) => {
    setExpandedPairs((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  const formatHeaders = (headers: Record<string, string[]>) => {
    return Object.entries(headers)
      .map(([key, values]) => `${key}: ${values.join(", ")}`)
      .join("\n");
  };

  return (
    <>
      <div className="flex items-center gap-3">
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          leftIcon={<FontAwesomeIcon icon={faMagnifyingGlass} />}
          placeholder="Search requests..."
          className="flex-1 bg-mineshaft-800"
          containerClassName="flex-1 bg-transparent"
        />
        <Switch
          className="bg-mineshaft-400/50 shadow-inner data-[state=checked]:bg-primary/80"
          thumbClassName="bg-mineshaft-800"
          id="hide-assets"
          isChecked={hideAssets}
          onCheckedChange={setHideAssets}
        >
          <span className="flex items-center gap-1.5 text-xs text-mineshaft-300 whitespace-nowrap">
            <FontAwesomeIcon icon={faFilter} className="text-mineshaft-400" />
            Pages only
          </span>
        </Switch>
      </div>

      <div className="flex grow flex-col gap-1.5 overflow-y-auto text-xs">
        {filteredTimeline.length > 0 ? (
          filteredTimeline.map((entry, index) => {
            if (entry.type === "screenshot") {
              return (
                <button
                  key={`screenshot-${index}`}
                  type="button"
                  onClick={() => setPreviewImage(entry.event.image)}
                  className="flex items-center gap-3 rounded-md border border-yellow-500/30 bg-yellow-500/10 px-3 py-2 text-left transition-colors hover:bg-yellow-500/20"
                >
                  <FontAwesomeIcon icon={faCamera} className="text-yellow-400" />
                  <span className="text-bunker-500">
                    {new Date(entry.timestamp).toLocaleTimeString()}
                  </span>
                  <span className="text-yellow-300">Screenshot captured</span>
                  <span className="text-bunker-500">
                    ({Math.round((entry.event.image.length * 3) / 4 / 1024)}KB)
                  </span>
                  <span className="ml-auto rounded bg-yellow-500/20 px-2 py-0.5 text-yellow-300">Click to preview</span>
                </button>
              );
            }

            const { request, response } = entry;
            const isExpanded = expandedPairs[request.requestId] ?? false;
            const contentType = getContentType(response?.headers);
            const statusCode = response?.status ?? "pending";

            return (
              <div
                key={request.requestId}
                className="rounded-md border border-mineshaft-700 bg-mineshaft-800"
              >
                <button
                  type="button"
                  onClick={() => togglePair(request.requestId)}
                  className="flex w-full items-center gap-3 px-3 py-2 text-left transition-colors hover:bg-mineshaft-700/50"
                >
                  <FontAwesomeIcon
                    icon={isExpanded ? faChevronUp : faChevronDown}
                    className="text-bunker-500"
                  />
                  <span className="text-bunker-500">
                    {new Date(request.timestamp).toLocaleTimeString()}
                  </span>
                  <span className="rounded bg-blue-500/20 px-1.5 py-0.5 font-semibold text-blue-400">
                    {request.method}
                  </span>
                  <span className="flex-1 truncate font-mono text-bunker-200">
                    {request.url}
                  </span>
                  <span className={`font-mono font-semibold ${getStatusColor(statusCode)}`}>
                    {statusCode}
                  </span>
                  {contentType && (
                    <span className="text-bunker-500">{contentType}</span>
                  )}
                </button>

                {isExpanded && (
                  <div className="border-t border-mineshaft-700 px-3 py-2">
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <div className="mb-1 text-xs font-semibold text-blue-400">
                          Request Headers
                        </div>
                        <pre className="max-h-40 overflow-auto rounded bg-mineshaft-900 p-2 font-mono text-xs text-bunker-300">
                          {formatHeaders(request.headers)}
                        </pre>
                      </div>
                      {response && (
                        <div>
                          <div className="mb-1 text-xs font-semibold text-green-400">
                            Response Headers
                          </div>
                          <pre className="max-h-40 overflow-auto rounded bg-mineshaft-900 p-2 font-mono text-xs text-bunker-300">
                            {formatHeaders(response.headers)}
                          </pre>
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            );
          })
        ) : (
          <div className="flex grow items-center justify-center text-bunker-300">
            <div className="text-center">
              {search.length ? (
                <div>No requests match search criteria</div>
              ) : (
                <div>
                  <div className="mb-2">Session logs are not yet available</div>
                  <div className="text-xs text-bunker-400">
                    Logs will be uploaded after the session ends.
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Screenshot preview modal */}
      <Modal isOpen={!!previewImage} onOpenChange={() => setPreviewImage(null)}>
        <ModalContent className="max-w-5xl" title="Screenshot Preview">
          {previewImage && (
            <img
              src={`data:image/jpeg;base64,${previewImage}`}
              alt="Session screenshot"
              className="w-full rounded border border-mineshaft-600"
            />
          )}
        </ModalContent>
      </Modal>
    </>
  );
};
