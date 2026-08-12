import { Helmet } from "react-helmet";
import { useParams, useSearch } from "@tanstack/react-router";
import { PlayIcon, SquareIcon } from "lucide-react";

import { createNotification } from "@app/components/notifications";
import { PageHeader } from "@app/components/v2";
import { Alert, AlertDescription, AlertTitle, Badge, Button, Skeleton } from "@app/components/v3";
import { ProjectType } from "@app/hooks/api/projects/types";
import { SandboxStatus, useGetSandboxById, useSetSandboxPower } from "@app/hooks/api/sandboxes";

import { AgentTab, IntegrationsTab, OverviewTab, PamAccountsTab, TerminalTab } from "./components";

export enum SandboxTab {
  Overview = "overview",
  Integrations = "integrations",
  Pam = "pam",
  Agent = "agent",
  Terminal = "terminal"
}

export const SandboxPage = () => {
  const { sandboxId } = useParams({ strict: false }) as { sandboxId: string };
  const tab = useSearch({ strict: false, select: (el) => el.selectedTab }) ?? SandboxTab.Overview;

  const { data: sandbox, isPending, isError } = useGetSandboxById(sandboxId);
  const setPower = useSetSandboxPower();

  const isRunning = sandbox?.status === SandboxStatus.Running;

  const handlePower = async () => {
    if (!sandbox) return;

    const action = isRunning ? "stop" : "start";
    await setPower.mutateAsync({ sandboxId: sandbox.id, action });
    createNotification({
      type: "success",
      text: action === "start" ? "Sandbox started" : "Sandbox stopped"
    });
  };

  if (isPending) {
    return (
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-6 px-6 py-6">
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
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-6 px-6 py-6">
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

      <div className="mx-auto flex w-full max-w-7xl flex-col gap-6 px-6 py-6">
        <div>
          <PageHeader
            scope={ProjectType.Sandbox}
            title={sandbox.name}
            description={
              sandbox.description ?? "An isolated environment for agents and untrusted code."
            }
          >
            <div className="flex items-center gap-3">
              <Badge variant={isRunning ? "success" : "neutral"}>
                {isRunning ? "Running" : "Stopped"}
              </Badge>
              <Button
                variant={isRunning ? "danger" : "project"}
                onClick={handlePower}
                isPending={setPower.isPending}
              >
                {isRunning ? <SquareIcon className="size-4" /> : <PlayIcon className="size-4" />}
                {isRunning ? "Stop" : "Start"}
              </Button>
            </div>
          </PageHeader>

          {tab === SandboxTab.Integrations && <IntegrationsTab sandbox={sandbox} />}
          {tab === SandboxTab.Pam && <PamAccountsTab sandbox={sandbox} />}
          {tab === SandboxTab.Agent && <AgentTab sandbox={sandbox} />}
          {tab === SandboxTab.Terminal && <TerminalTab sandbox={sandbox} />}
          {tab === SandboxTab.Overview && <OverviewTab sandbox={sandbox} />}
        </div>
      </div>
    </>
  );
};
