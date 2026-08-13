import { useEffect, useMemo, useRef, useState } from "react";
import { CheckIcon, Loader2Icon, XIcon } from "lucide-react";

import { SandboxIntegrationType, TSandbox } from "@app/hooks/api/sandboxes";

/**
 * The boot sequence shown while a sandbox starts, in place of the terminal it hands off to. The
 * steps are illustrative rather than reported by the backend, so the pacing is padded to the real
 * request instead of racing it: the last step does not complete until the start has actually
 * returned, and a failure stops the sequence where it stands rather than showing a boot that never
 * happened.
 */

export type TSandboxBoot = {
  /** Null while the start is in flight, then the outcome. */
  outcome: "success" | "error" | null;
  errorMessage?: string;
};

type Props = {
  sandbox: TSandbox;
  boot: TSandboxBoot;
  /** Called once the sequence has finished, so the terminal can take over. */
  onSettled: () => void;
};

type TBootStep = {
  label: string;
  detail: string;
  /**
   * Roughly what the step would cost if it were real, so the sequence has a rhythm: fetching a
   * binary visibly outlasts making a directory. Scaled down when the whole run would overrun.
   */
  durationMs: number;
};

/** Ceiling for the whole sequence, so a fully configured sandbox still finishes promptly. */
const BOOT_BUDGET_MS = 4_500;
/** Each step varies a little so the cadence does not look metronomic. */
const JITTER = 0.18;

const AGENT_LABELS: Record<string, string> = {
  gemini: "Gemini",
  claude: "Claude Code",
  codex: "Codex",
  copilot: "GitHub Copilot"
};

const buildSteps = (sandbox: TSandbox): TBootStep[] => {
  const integrations = sandbox.grants.integrations ?? [];
  const pamCount = (sandbox.grants.pamAccountIds ?? []).length;
  const agent = sandbox.agentType ? (AGENT_LABELS[sandbox.agentType] ?? sandbox.agentType) : null;

  const steps: TBootStep[] = [
    {
      label: "Allocating compute",
      detail: `${sandbox.vcpu} vCPU · ${(sandbox.memoryMb / 1024).toFixed(0)} GB memory`,
      durationMs: 350
    },
    { label: "Mounting workspace", detail: "/workspace · overlayfs", durationMs: 200 },
    { label: "Starting credential broker", detail: "MITM proxy on 127.0.0.1", durationMs: 475 }
  ];

  steps.push({
    label: "Issuing proxy certificate authority",
    detail: "ECDSA P-256 · trust installed",
    durationMs: 700
  });

  if (integrations.length) {
    steps.push({
      label: "Registering brokered hosts",
      detail: integrations
        .flatMap((integration) => integration.hostnames)
        .slice(0, 3)
        .join(", "),
      durationMs: 425
    });
  }

  if (integrations.some((integration) => integration.type === SandboxIntegrationType.GitHub)) {
    steps.push({
      label: "Installing gh CLI",
      detail: "into the sandbox's own bin/",
      durationMs: 1100
    });
  }

  if (pamCount) {
    steps.push({
      label: "Opening PAM tunnels",
      detail: `${pamCount} account${pamCount === 1 ? "" : "s"} · credentials stay outside`,
      durationMs: 250 + pamCount * 225
    });
  }

  if (agent) {
    steps.push({ label: `Bringing up ${agent}`, detail: "tools registered", durationMs: 800 });
  }

  steps.push({ label: "Sandbox ready", detail: "accepting commands", durationMs: 175 });

  // A sandbox with every option on would otherwise run past the point where the wait stops reading
  // as progress, so the whole sequence is compressed to fit rather than any one step being cut.
  const total = steps.reduce((sum, step) => sum + step.durationMs, 0);
  if (total <= BOOT_BUDGET_MS) return steps;

  const scale = BOOT_BUDGET_MS / total;
  return steps.map((step) => ({ ...step, durationMs: Math.round(step.durationMs * scale) }));
};

export const SandboxBootConsole = ({ sandbox, boot, onSettled }: Props) => {
  const { outcome, errorMessage } = boot;
  const steps = useMemo(() => buildSteps(sandbox), [sandbox]);
  const [completed, setCompleted] = useState(0);
  const [elapsed, setElapsed] = useState<number[]>([]);
  const scrollRef = useRef<HTMLDivElement>(null);

  const prefersReducedMotion =
    typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  const failed = outcome === "error";
  // The final step is held back until the request lands, so "ready" is never claimed early.
  const ceiling = outcome === "success" ? steps.length : steps.length - 1;

  useEffect(() => {
    if (failed || completed >= ceiling) return undefined;

    const base = steps[completed]?.durationMs ?? 400;
    const jittered = base * (1 + (Math.random() * 2 - 1) * JITTER);
    // Reduced motion still wants the sequence, just not the dwell on each line.
    const duration = Math.round(prefersReducedMotion ? Math.min(base, 200) : jittered);

    const timer = setTimeout(() => {
      setElapsed((prev) => [...prev, duration]);
      setCompleted((prev) => prev + 1);
    }, duration);

    return () => clearTimeout(timer);
  }, [failed, completed, ceiling, steps, prefersReducedMotion]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [completed]);

  const isDone = outcome === "success" && completed >= steps.length;

  useEffect(() => {
    if (!isDone) return undefined;
    // A beat on the finished log before the shell replaces it, so the handoff is legible.
    const timer = setTimeout(onSettled, 600);
    return () => clearTimeout(timer);
  }, [isDone, onSettled]);

  const progress = Math.round((completed / steps.length) * 100);

  return (
    <div className="flex h-[380px] flex-col overflow-hidden rounded-md border border-border bg-[#111417]">
      <div ref={scrollRef} className="thin-scrollbar flex-1 overflow-y-auto p-3">
        <p className="mb-2 font-mono text-xs text-white/30">
          Booting <span className="text-white/60">{sandbox.name}</span>
        </p>

        <ul className="flex flex-col gap-1.5 font-mono text-xs">
          {steps.map((step, index) => {
            const isComplete = index < completed;
            const isCurrent = index === completed;
            const isFailedStep = failed && isCurrent;

            if (!isComplete && !isCurrent) return null;

            return (
              <li key={step.label} className="flex items-start gap-2.5 leading-relaxed">
                <span className="mt-0.5 flex size-3.5 shrink-0 items-center justify-center">
                  {isComplete && <CheckIcon className="size-3.5 text-[#30a46c]" />}
                  {isFailedStep && <XIcon className="size-3.5 text-[#e5484d]" />}
                  {isCurrent && !isFailedStep && (
                    <Loader2Icon className="size-3.5 animate-spin text-[#00a2c7]" />
                  )}
                </span>

                <span className="min-w-0 flex-1">
                  <span className={isComplete ? "text-[#c8ccd0]" : "text-white/70"}>
                    {step.label}
                  </span>
                  <span className="text-white/30"> &middot; {step.detail}</span>
                </span>

                {isComplete && (
                  <span className="shrink-0 text-white/25 tabular-nums">
                    {((elapsed[index] ?? 0) / 1000).toFixed(2)}s
                  </span>
                )}
              </li>
            );
          })}
        </ul>

        {failed && (
          <p className="mt-3 border-l-2 border-[#e5484d] pl-3 font-mono text-xs text-[#e5484d]">
            {errorMessage ?? "The sandbox failed to start."}
          </p>
        )}
      </div>

      <div className="border-t border-white/10 px-3 py-2.5">
        <div className="h-0.5 w-full overflow-hidden rounded-full bg-white/10">
          <div
            className={`h-full rounded-full transition-all duration-300 ease-out ${
              failed ? "bg-[#e5484d]" : "bg-[#30a46c]"
            }`}
            style={{ width: `${failed ? 100 : progress}%` }}
          />
        </div>

        <p className="mt-2 font-mono text-[11px] text-white/30">
          {failed ? "boot failed" : `${Math.min(completed, steps.length)}/${steps.length} complete`}
        </p>
      </div>
    </div>
  );
};
