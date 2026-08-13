import { useEffect, useState } from "react";
import { Helmet } from "react-helmet";
import { useParams, useSearch } from "@tanstack/react-router";
import { PlayIcon, SquareIcon } from "lucide-react";

import { createNotification } from "@app/components/notifications";
import {
  Alert,
  AlertDescription,
  AlertTitle,
  Badge,
  Button,
  PageHeader,
  Skeleton
} from "@app/components/v3";
import { ProjectType } from "@app/hooks/api/projects/types";
import { SandboxStatus, useGetSandboxById, useSetSandboxPower } from "@app/hooks/api/sandboxes";

import { SandboxShine } from "../components/SandboxShine";
import {
  AccessTab,
  AuditLogTab,
  ChatTab,
  OverviewTab,
  SettingsTab,
  TerminalTab
} from "./components";

export enum SandboxTab {
  Overview = "overview",
  Chat = "chat",
  Terminal = "terminal",
  AuditLog = "audit-log",
  Access = "access",
  Settings = "settings"
}

export const SandboxPage = () => {
  const { sandboxId } = useParams({ strict: false }) as { sandboxId: string };
  const tab = useSearch({ strict: false, select: (el) => el.selectedTab }) ?? SandboxTab.Overview;

  const { data: sandbox, isPending, isError } = useGetSandboxById(sandboxId);
  const setPower = useSetSandboxPower();

  const isRunning = sandbox?.status === SandboxStatus.Running;

  // Only starting gets the boot console; stopping is immediate and does not need narrating.
  const [boot, setBoot] = useState<{
    outcome: "success" | "error" | null;
    errorMessage?: string;
  } | null>(null);

  /**
   * The boot console is a fiction, so it must never outlive the thing it is narrating. Two ways it
   * could: a failed start leaves it with nowhere to go, and any path that sets it without settling
   * would strand it. This clears it whenever no start is in flight, which is the only condition
   * under which it is ever allowed on screen.
   */
  useEffect(() => {
    if (!boot || setPower.isPending || boot.outcome === null) return undefined;

    const timer = setTimeout(() => setBoot(null), boot.outcome === "error" ? 4_000 : 1_200);
    return () => clearTimeout(timer);
  }, [boot, setPower.isPending]);

  // Leaving the tab abandons the narration; it must not be waiting when the user comes back.
  useEffect(() => {
    if (tab !== SandboxTab.Terminal) setBoot(null);
  }, [tab]);

  const handlePower = async () => {
    if (!sandbox) return;

    if (isRunning) {
      await setPower.mutateAsync({ sandboxId: sandbox.id, action: "stop" });
      createNotification({ type: "success", text: "Sandbox stopped" });
      return;
    }

    setBoot({ outcome: null });
    try {
      await setPower.mutateAsync({ sandboxId: sandbox.id, action: "start" });
      setBoot({ outcome: "success" });
    } catch (error) {
      // MutationCache reports the failure globally already; this copy is only so the console can
      // stop on the step that failed rather than closing and leaving the toast to explain it.
      const message = (error as { response?: { data?: { message?: string } } })?.response?.data
        ?.message;
      setBoot({ outcome: "error", errorMessage: message });
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
            <Button
              variant={isRunning ? "danger" : "project"}
              onClick={handlePower}
              isPending={setPower.isPending}
            >
              {isRunning ? <SquareIcon /> : <PlayIcon />}
              {isRunning ? "Stop" : "Start"}
            </Button>
          </PageHeader>

          <div className="mt-4">
            {tab === SandboxTab.Chat && <ChatTab sandbox={sandbox} />}
            {tab === SandboxTab.Terminal && (
              <TerminalTab sandbox={sandbox} boot={boot} onBootSettled={() => setBoot(null)} />
            )}
            {tab === SandboxTab.AuditLog && <AuditLogTab sandbox={sandbox} />}
            {tab === SandboxTab.Access && <AccessTab sandbox={sandbox} />}
            {tab === SandboxTab.Settings && <SettingsTab sandbox={sandbox} />}
            {tab === SandboxTab.Overview && <OverviewTab sandbox={sandbox} />}
          </div>
        </div>
      </div>
    </>
  );
};
