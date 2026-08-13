import { useState } from "react";
import { GlobeIcon, RefreshCwIcon } from "lucide-react";

import {
  Badge,
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
  IconButton,
  Input
} from "@app/components/v3";
import { SandboxStatus, TSandbox, useGetSandboxPreview } from "@app/hooks/api/sandboxes";

/**
 * Whatever the sandbox is serving. Rendered from the fetched markup rather than by pointing an
 * iframe at the container: the API and the sandbox share a docker network the browser cannot reach,
 * and nothing has to be published on the host to make this work.
 */
export const PreviewTab = ({ sandbox }: { sandbox: TSandbox }) => {
  const [port, setPort] = useState(3000);
  const isRunning = sandbox.status === SandboxStatus.Running;

  const { data, isFetching, refetch } = useGetSandboxPreview(sandbox.id, port, isRunning);
  const isServing = Boolean(data && data.status > 0);

  return (
    <Card className="min-w-0">
      <CardHeader>
        <CardTitle>Preview</CardTitle>
        <CardDescription>
          What the sandbox is serving. Anything the agent runs on this port shows up here.
        </CardDescription>
        <CardAction>
          <div className="flex items-center gap-2">
            <Badge variant={isServing ? "success" : "neutral"}>
              {isServing ? `Serving on ${port}` : "Nothing on this port"}
            </Badge>
            <IconButton variant="ghost" size="xs" aria-label="Refresh" onClick={() => void refetch()}>
              <RefreshCwIcon className={`size-3.5 ${isFetching ? "animate-spin" : ""}`} />
            </IconButton>
          </div>
        </CardAction>
      </CardHeader>

      <CardContent className="flex flex-col gap-3">
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted">Port</span>
          <Input
            value={String(port)}
            onChange={(e) => setPort(Number(e.target.value) || 0)}
            className="w-28 font-mono text-xs"
          />
        </div>

        {!isRunning || !isServing ? (
          <Empty frame="dashed">
            <EmptyHeader>
              <EmptyMedia>
                <GlobeIcon />
              </EmptyMedia>
              <EmptyTitle>{isRunning ? "Nothing is being served" : "Sandbox is stopped"}</EmptyTitle>
              <EmptyDescription>
                {isRunning
                  ? `Ask the agent to build something and serve it on port ${port}.`
                  : "Start the sandbox to preview what it serves."}
              </EmptyDescription>
            </EmptyHeader>
          </Empty>
        ) : (
          <iframe
            // Sandboxed with no allow-same-origin: the page came from untrusted code, so it gets a
            // null origin and cannot reach anything of ours.
            sandbox=""
            title="Sandbox preview"
            srcDoc={data?.body}
            className="h-[calc(100vh-26rem)] min-h-[320px] w-full rounded-md border border-border bg-white"
          />
        )}
      </CardContent>
    </Card>
  );
};
