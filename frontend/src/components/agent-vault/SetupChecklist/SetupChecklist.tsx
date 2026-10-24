import { CheckIcon, XIcon } from "lucide-react";
import { twMerge } from "tailwind-merge";

import { IconButton, Tooltip, TooltipContent, TooltipTrigger } from "@app/components/v3";

import { AgentVaultSetupStep, TAgentVaultSetupProgress } from "./useAgentVaultSetupProgress";
import { useOpenAgentVaultSetupStep } from "./useOpenAgentVaultSetupStep";

type Step = {
  step: AgentVaultSetupStep;
  title: string;
  description: string;
  isComplete: boolean;
  isBlocked?: boolean;
};

type Props = {
  progress: TAgentVaultSetupProgress;
};

// Each step takes the admin to the page that owns the action and opens it there, so the page behind the
// dialog is always the one they are setting up.
export const SetupChecklist = ({ progress }: Props) => {
  const openStep = useOpenAgentVaultSetupStep(progress);

  const { hasProxy, hasConnectedProxy, newestBundle, hasService, hasSession, completedCount } =
    progress;

  const steps: Step[] = [
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

  const nextIndex = steps.findIndex((step) => step.step === progress.nextStep);

  if (!progress.isVisible) return null;

  return (
    <div className="mx-2 mb-1 rounded-md border border-border bg-container p-3 group-data-[collapsible=icon]:hidden">
      <div className="flex items-center gap-2">
        <span className="flex-1 text-sm font-medium">Get Started</span>
        <span className="text-xs text-muted">
          {completedCount} of {steps.length}
        </span>
        <Tooltip>
          <TooltipTrigger asChild>
            <IconButton
              variant="ghost"
              size="xs"
              className="-mr-1"
              aria-label="Hide setup steps"
              onClick={progress.dismiss}
            >
              <XIcon />
            </IconButton>
          </TooltipTrigger>
          <TooltipContent side="right">Hide Setup Steps</TooltipContent>
        </Tooltip>
      </div>
      <div
        role="progressbar"
        aria-label="Setup progress"
        aria-valuemin={0}
        aria-valuemax={steps.length}
        aria-valuenow={completedCount}
        className="mt-2 h-1 overflow-hidden rounded-full bg-border"
      >
        <div
          className="h-full rounded-full bg-product-av transition-[width] duration-300"
          style={{ width: `${(completedCount / steps.length) * 100}%` }}
        />
      </div>
      <ol className="-mx-1.5 mt-2 flex flex-col">
        {steps.map((step, index) => {
          const isNext = index === nextIndex;
          return (
            <li key={step.title}>
              <button
                type="button"
                disabled={step.isComplete || step.isBlocked}
                onClick={() => openStep(step.step)}
                className="flex w-full cursor-pointer items-start gap-2 rounded-sm px-1.5 py-1.5 text-left outline-none hover:bg-container-hover focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-default disabled:hover:bg-transparent"
              >
                <span
                  aria-hidden
                  className={twMerge(
                    "mt-px flex size-4 shrink-0 items-center justify-center rounded-full border text-[10px] leading-none [&_svg]:size-2.5",
                    step.isComplete && "border-success bg-success/10 text-success",
                    !step.isComplete && isNext && "border-product-av bg-product-av/15",
                    !step.isComplete && !isNext && "border-border text-muted"
                  )}
                >
                  {step.isComplete ? <CheckIcon strokeWidth={3} /> : index + 1}
                </span>
                <span className="flex min-w-0 flex-col gap-0.5">
                  <span
                    className={twMerge(
                      "text-xs",
                      isNext ? "font-medium text-foreground" : "text-muted"
                    )}
                  >
                    <span className="sr-only">{step.isComplete ? "Done: " : "To do: "}</span>
                    {step.title}
                  </span>
                  {isNext && <span className="text-2xs text-muted">{step.description}</span>}
                </span>
              </button>
            </li>
          );
        })}
      </ol>
    </div>
  );
};
