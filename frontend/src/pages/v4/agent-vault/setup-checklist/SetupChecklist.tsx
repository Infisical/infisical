import { Button } from "@infisical/cipher/ui/button";
import { Icon } from "@infisical/cipher/ui/icon";
import { Progress } from "@infisical/cipher/ui/progress";
import type { SidebarProps } from "@infisical/cipher/ui/sidebar";
import { Tooltip } from "@infisical/cipher/ui/tooltip";

import type { ShellLocation } from "../../shell/location";
import {
  AgentVaultSetupStep,
  type TAgentVaultSetupProgress,
  useAgentVaultSetupProgress,
  useOpenAgentVaultSetupStep
} from "./setup-progress";

const TITLE = "Get Started";

type Step = {
  step: AgentVaultSetupStep;
  title: string;
  description: string;
  isComplete: boolean;
  isBlocked?: boolean;
};

const setupSteps = ({
  hasProxy,
  hasConnectedProxy,
  newestBundle,
  hasService,
  hasSession
}: TAgentVaultSetupProgress): Step[] => [
  {
    step: AgentVaultSetupStep.Proxy,
    title: "Set Up a Proxy",
    description:
      hasProxy && !hasConnectedProxy
        ? "Waiting for your proxy to connect. Start it with its proxy token where agent traffic leaves your network."
        : "Agents send requests through a proxy, which attaches the credentials.",
    isComplete: hasConnectedProxy
  },
  {
    step: AgentVaultSetupStep.AccessBundle,
    title: "Create an Access Bundle",
    description: "A bundle groups the services an agent can reach.",
    isComplete: Boolean(newestBundle)
  },
  {
    step: AgentVaultSetupStep.Service,
    title: "Add a Service",
    description: "Name an API the agent can call and the credential to attach.",
    isComplete: hasService,
    isBlocked: !newestBundle
  },
  {
    step: AgentVaultSetupStep.Session,
    title: "Create a Session",
    description: "Get a token an agent runs with.",
    isComplete: hasSession,
    isBlocked: !newestBundle
  }
];

const SetupChecklist = ({
  orgId,
  projectId,
  progress,
  steps
}: {
  orgId: string;
  projectId: string;
  progress: TAgentVaultSetupProgress;
  steps: Step[];
}) => {
  const openStep = useOpenAgentVaultSetupStep(orgId, projectId, progress);
  const { completedCount } = progress;

  return (
    <section
      aria-label={TITLE}
      className="flex flex-col gap-3 border border-[color:var(--cipher-line-soft)] bg-[color:var(--cipher-surface)] p-3"
    >
      <div className="flex items-start gap-2">
        <div className="min-w-0 flex-1">
          <Progress
            value={completedCount}
            max={steps.length}
            label={TITLE}
            valueLabel={`${completedCount} of ${steps.length}`}
          />
        </div>
        <Tooltip content="Hide Setup Steps" side="right">
          <Button
            variant="ghost"
            size="icon-xs"
            icon="x"
            iconOnly
            aria-label="Hide setup steps"
            onClick={progress.dismiss}
          />
        </Tooltip>
      </div>
      <ol className="m-0 -mx-1.5 flex list-none flex-col p-0">
        {steps.map((step) => {
          const isNext = step.step === progress.nextStep;
          let markerClass = "border-[color:var(--cipher-line)]";
          if (step.isComplete)
            markerClass =
              "border-[color:var(--cipher-ink)] bg-[color:var(--cipher-ink)] text-[color:var(--cipher-surface)]";
          else if (isNext) markerClass = "border-[color:var(--cipher-ink)]";
          return (
            <li key={step.step}>
              <button
                type="button"
                disabled={step.isComplete || step.isBlocked}
                onClick={() => openStep(step.step)}
                className="flex w-full min-w-0 items-start gap-2 px-1.5 py-1.5 text-left text-xs hover:bg-[color:var(--cipher-hover)] focus-visible:outline-2 focus-visible:outline-[color:var(--cipher-ink)] disabled:hover:bg-transparent"
              >
                <span
                  aria-hidden="true"
                  className={`mt-0.5 inline-flex size-3 flex-none items-center justify-center border ${markerClass}`}
                >
                  {step.isComplete && <Icon name="check" size={10} />}
                </span>
                <span className="flex min-w-0 flex-col gap-0.5">
                  <span
                    className={`[overflow-wrap:anywhere] ${isNext ? "font-medium text-foreground" : "text-muted-foreground"}`}
                  >
                    <span className="sr-only">{step.isComplete ? "Done: " : "To do: "}</span>
                    {step.title}
                  </span>
                  {isNext && <span className="text-muted-foreground">{step.description}</span>}
                </span>
              </button>
            </li>
          );
        })}
      </ol>
    </section>
  );
};

export const useAgentVaultSetupSidebar = (
  orgId: string,
  at: ShellLocation
): Pick<SidebarProps, "footer" | "footerIcon" | "footerLabel" | "footerItems"> => {
  const projectId = at.level === "agent-vault" ? at.projectId : undefined;
  const progress = useAgentVaultSetupProgress(orgId, projectId ?? "");
  if (!projectId) return {};

  if (progress.canRestore)
    return {
      footerItems: [
        {
          id: "agent-vault-setup-steps",
          label: "Setup Steps",
          icon: "list-checks",
          onClick: progress.restore
        }
      ]
    };

  if (!progress.isVisible) return {};

  const steps = setupSteps(progress);
  return {
    footer: (
      <SetupChecklist orgId={orgId} projectId={projectId} progress={progress} steps={steps} />
    ),
    footerIcon: "list-checks",
    footerLabel: `${TITLE}, ${progress.completedCount} of ${steps.length} done`
  };
};
