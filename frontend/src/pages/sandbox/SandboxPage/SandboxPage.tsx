import { useState } from "react";
import { Helmet } from "react-helmet";
import { useQueryClient } from "@tanstack/react-query";
import { useParams, useSearch } from "@tanstack/react-router";
import { ActivityIcon, PlayIcon, SquareIcon } from "lucide-react";

import { createNotification } from "@app/components/notifications";
import {
  Alert,
  AlertDescription,
  AlertTitle,
  Badge,
  Button,
  IconButton,
  PageHeader,
  Skeleton,
  Tooltip,
  TooltipContent,
  TooltipTrigger
} from "@app/components/v3";
import { ProjectType } from "@app/hooks/api/projects/types";
import {
  sandboxKeys,
  SandboxStatus,
  streamSandboxStart,
  useGetSandboxById,
  useGetSandboxMetrics,
  useSetSandboxPower,
  useSetSandboxWorkload
} from "@app/hooks/api/sandboxes";

import { SandboxShine } from "../components/SandboxShine";
import { SandboxBootDock, TBootLine } from "./components/SandboxBootDock";
import {
  ActivityTab,
  ChatTab,
  IntegrationsTab,
  OverviewTab,
  ProcessMonitorTab,
  SettingsTab,
  TerminalTab
} from "./components";

export enum SandboxTab {
  Overview = "overview",
  Chat = "chat",
  Terminal = "terminal",
  ProcessMonitor = "process-monitor",
  Activity = "activity",
  Integrations = "integrations",
  Settings = "settings"
}

export const SandboxPage = () => {
  const { sandboxId } = useParams({ strict: false }) as { sandboxId: string };
  const tab = useSearch({ strict: false, select: (el) => el.selectedTab }) ?? SandboxTab.Overview;

  const { data: sandbox, isPending, isError } = useGetSandboxById(sandboxId);
  const setPower = useSetSandboxPower();
  const setWorkload = useSetSandboxWorkload();
  const queryClient = useQueryClient();

  const [dockLines, setDockLines] = useState<TBootLine[] | null>(null);
  const [dockStep, setDockStep] = useState<string | null>(null);
  const [isBooting, setIsBooting] = useState(false);

  const isRunning = sandbox?.status === SandboxStatus.Running;

  // Runtime state, not local: the process outlives the page, so a refresh must not lose track of it.
  const { data: headerMetrics } = useGetSandboxMetrics(sandboxId, isRunning);
  const isWorkloadOn = Boolean(headerMetrics?.isWorkloadRunning);

  const handlePower = async () => {
    if (!sandbox) return;

    if (isRunning) {
      await setPower.mutateAsync({ sandboxId: sandbox.id, action: "stop" });
      createNotification({ type: "success", text: "Sandbox stopped" });
      return;
    }

    // Streamed rather than a plain POST: a start takes tens of seconds, and a bare spinner for that
    // long reads as a hang. The same events drive the dock and the button label.
    setDockLines([]);
    setDockStep("Starting sandbox");
    setIsBooting(true);

    try {
      await streamSandboxStart(sandbox.id, (event) => {
        if (event.type === "step") {
          setDockStep(event.message);
          setDockLines((prev) => [...(prev ?? []), { text: event.message }]);
        } else if (event.type === "log") {
          setDockLines((prev) => [...(prev ?? []), { text: event.message }]);
        } else if (event.type === "error") {
          setDockStep("Start failed");
          setDockLines((prev) => [...(prev ?? []), { text: event.message, isError: true }]);
        }
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "The sandbox failed to start.";
      setDockStep("Start failed");
      setDockLines((prev) => [...(prev ?? []), { text: message, isError: true }]);
    } finally {
      setIsBooting(false);
      // The charts read `status` and the metrics endpoint, neither of which knows the start
      // finished, so nothing repaints until these are refetched.
      await queryClient.invalidateQueries({ queryKey: sandboxKeys.byId(sandbox.id) });
      await queryClient.invalidateQueries({ queryKey: sandboxKeys.list() });
      await queryClient.invalidateQueries({ queryKey: sandboxKeys.metrics(sandbox.id) });
    }
  };

  if (isPending) {
    return (
      <div className="mx-auto mb-6 w-full max-w-8xl">
        <div>
          <Skeleton className="h-96" />
        </div>
      </div>
    );
  }

  // A sandbox deleted from another tab is the common way to land here, so name it rather than
  // rendering an empty page.
  if (isError || !sandbox) {
    return (
      <div className="mx-auto mb-6 w-full max-w-8xl">
        <div>
          <Alert variant="danger">
            <AlertTitle>Sandbox unavailable</AlertTitle>
            <AlertDescription>
              This sandbox could not be loaded. It may have been deleted, or you may not have access
              to it.
            </AlertDescription>
          </Alert>
        </div>
      </div>
    );
  }

  return (
    <>
      <Helmet>
        <title>{sandbox.name}</title>
      </Helmet>

      <SandboxShine sandboxId={sandbox.id} />

      {tab !== SandboxTab.Terminal && (
        <SandboxBootDock
          lines={dockLines}
          step={dockStep}
          isDone={!isBooting && !dockLines?.some((line) => line.isError)}
          hasFailed={Boolean(dockLines?.some((line) => line.isError))}
          onDismiss={() => setDockLines(null)}
        />
      )}

      <div className="mx-auto mb-6 w-full max-w-8xl">
        <div>
          <PageHeader
            scope={ProjectType.Sandbox}
            title={
              // PageHeader underlines its h1, and text decoration propagates from an ancestor: a
              // descendant cannot switch it off. An inline-flex box is atomic, so the line is not
              // drawn through it, which lets the name opt back in on its own.
              <span className="inline-flex items-center gap-3 align-middle">
                <span className="underline decoration-project/90 underline-offset-4">
                  {sandbox.name}
                </span>
                <Badge variant={isRunning ? "success" : "neutral"}>
                  {isRunning ? "Running" : "Stopped"}
                </Badge>
              </span>
            }
            description={
              sandbox.description ?? "An isolated environment for agents and untrusted code."
            }
          >
            {/* On every tab, not just the overview: the other pages are the ones that tell you to
                start the sandbox, so that is exactly where the control needs to be. */}
            {/* Only while running, and deliberately understated: it is a demo aid, not part of
                operating a sandbox. */}
            {isRunning && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <IconButton
                    variant="ghost"
                    size="xs"
                    aria-label={isWorkloadOn ? "Stop demo workload" : "Run demo workload"}
                    onClick={() =>
                      setWorkload.mutate({ sandboxId: sandbox.id, isEnabled: !isWorkloadOn })
                    }
                  >
                    <ActivityIcon
                      className={`size-3.5 ${isWorkloadOn ? "text-product-sandbox" : "text-muted"}`}
                    />
                  </IconButton>
                </TooltipTrigger>
                <TooltipContent>
                  {isWorkloadOn ? "Stop demo workload" : "Run a demo workload"}
                </TooltipContent>
              </Tooltip>
            )}
            <Button
              variant={isRunning ? "danger" : "project"}
              onClick={handlePower}
              isPending={setPower.isPending || isBooting}
            >
              {isRunning ? <SquareIcon /> : <PlayIcon />}
              {isRunning ? "Stop" : "Start"}
            </Button>
          </PageHeader>

          <div className="mt-4">
            {tab === SandboxTab.Chat && <ChatTab sandbox={sandbox} />}
            {tab === SandboxTab.Terminal && <TerminalTab sandbox={sandbox} />}
            {tab === SandboxTab.ProcessMonitor && <ProcessMonitorTab sandbox={sandbox} />}
            {tab === SandboxTab.Activity && <ActivityTab sandbox={sandbox} />}
            {tab === SandboxTab.Integrations && <IntegrationsTab sandbox={sandbox} />}
            {tab === SandboxTab.Settings && <SettingsTab sandbox={sandbox} />}
            {tab === SandboxTab.Overview && <OverviewTab sandbox={sandbox} />}
          </div>
        </div>
      </div>
    </>
  );
};
