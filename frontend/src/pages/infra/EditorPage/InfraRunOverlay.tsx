import { AnsiUp } from "ansi_up";
import { AnimatePresence, motion } from "framer-motion";
import { useCallback, useEffect, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import {
  CheckIcon,
  ChevronDownIcon,
  LoaderCircleIcon,
  ShieldAlertIcon,
  SparklesIcon,
  TerminalIcon,
  XIcon
} from "lucide-react";

import { Badge, Button } from "@app/components/v3";
import { buildGraphFromPlanJson, type TAiInsight, type TPlanJson } from "@app/hooks/api/infra/types";
import { ResourceTopologyGraph } from "../components/ResourceTopologyGraph";

// ── Helpers ──

const stripAnsi = (str: string) => str.replace(/\x1b\[[0-9;]*m/g, "");

/** Extract the tofu error block from logs (everything from first Error marker to the [infra] sentinel) */
const extractError = (logs: string): string | null => {
  const plain = stripAnsi(logs);
  const lines = plain.split("\n");

  let startIdx = -1;
  let endIdx = lines.length;

  for (let i = 0; i < lines.length; i += 1) {
    const trimmed = lines[i].trimStart();
    if (startIdx === -1 && /^(Error|│\s*Error|╷)/.test(trimmed)) {
      startIdx = i;
    }
    if (/^\[infra\] Error: tofu exited/.test(trimmed)) {
      endIdx = i;
      break;
    }
  }

  if (startIdx === -1) return null;

  const block = lines.slice(startIdx, endIdx);
  while (block.length > 0 && block[block.length - 1].trim() === "") {
    block.pop();
  }

  return block.length > 0 ? block.join("\n") : null;
};

// ── Types ──

type StepStatus = "pending" | "active" | "completed" | "failed";

type Step = {
  id: string;
  label: string;
  status: StepStatus;
  duration: number; // simulated ms before auto-advancing
};

// ── Constants ──

const ansiUp = new AnsiUp();
ansiUp.use_classes = false;

const PLAN_STEPS: Omit<Step, "status">[] = [
  { id: "init", label: "Initializing", duration: 2000 },
  { id: "plan", label: "Planning changes", duration: 5000 },
  { id: "done", label: "Complete", duration: 0 }
];

const APPLY_STEPS: Omit<Step, "status">[] = [
  { id: "init", label: "Initializing", duration: 2000 },
  { id: "plan", label: "Planning changes", duration: 4000 },
  { id: "apply", label: "Applying changes", duration: 6000 },
  { id: "done", label: "Complete", duration: 0 }
];

const DESTROY_STEPS: Omit<Step, "status">[] = [
  { id: "init", label: "Initializing", duration: 2000 },
  { id: "plan", label: "Planning destruction", duration: 5000 },
  { id: "destroy", label: "Destroying resources", duration: 7000 },
  { id: "done", label: "Complete", duration: 0 }
];

// ── Step Indicator ──

const StepIndicator = ({ status }: { status: StepStatus }) => (
  <div className="relative flex size-8 shrink-0 items-center justify-center">
    <AnimatePresence mode="wait">
      {status === "pending" && (
        <motion.div
          key="pending"
          initial={{ scale: 0 }}
          animate={{ scale: 1 }}
          exit={{ scale: 0 }}
          className="size-3 rounded-full border-2 border-mineshaft-600 bg-mineshaft-800"
        />
      )}
      {status === "active" && (
        <motion.div key="active" initial={{ scale: 0 }} animate={{ scale: 1 }} exit={{ scale: 0 }}>
          <motion.div
            className="absolute inset-0 rounded-full border-2 border-primary/40"
            animate={{ scale: [1, 1.6, 1], opacity: [0.6, 0, 0.6] }}
            transition={{ duration: 1.5, repeat: Infinity, ease: "easeInOut" }}
          />
          <LoaderCircleIcon className="size-5 animate-spin text-primary" />
        </motion.div>
      )}
      {status === "completed" && (
        <motion.div
          key="completed"
          initial={{ scale: 0, rotate: -180 }}
          animate={{ scale: 1, rotate: 0 }}
          transition={{ type: "spring", damping: 12, stiffness: 200 }}
          className="flex size-6 items-center justify-center rounded-full bg-green-500/20 ring-1 ring-green-500/30"
        >
          <CheckIcon className="size-3.5 text-green-400" />
        </motion.div>
      )}
      {status === "failed" && (
        <motion.div
          key="failed"
          initial={{ scale: 0 }}
          animate={{ scale: [0, 1.2, 1] }}
          transition={{ duration: 0.3 }}
          className="flex size-6 items-center justify-center rounded-full bg-red-500/20 ring-1 ring-red-500/30"
        >
          <XIcon className="size-3.5 text-red-400" />
        </motion.div>
      )}
    </AnimatePresence>
  </div>
);

// ── Connector Line ──

const ConnectorLine = ({ filled }: { filled: boolean }) => (
  <div className="relative ml-[15px] h-6 w-0.5 overflow-hidden bg-mineshaft-700">
    <motion.div
      className="absolute inset-x-0 top-0 w-full bg-green-500/60"
      initial={{ height: "0%" }}
      animate={{ height: filled ? "100%" : "0%" }}
      transition={{ duration: 0.4, ease: "easeOut" }}
    />
  </div>
);

// ── Main Overlay ──

type InfraRunOverlayProps = {
  isOpen: boolean;
  onClose: () => void;
  mode: "plan" | "apply" | "destroy";
  isRunning: boolean;
  output: string;
  planJson: TPlanJson | null;
  aiInsight: TAiInsight | null;
  awaitingApproval: boolean;
  onApprove: () => void;
  onDeny: () => void;
};

export const InfraRunOverlay = ({
  isOpen,
  onClose,
  mode,
  isRunning,
  output,
  planJson,
  aiInsight,
  awaitingApproval,
  onApprove,
  onDeny
}: InfraRunOverlayProps) => {
  const [steps, setSteps] = useState<Step[]>([]);
  const [showOutput, setShowOutput] = useState(false);
  const [showSuccess, setShowSuccess] = useState(false);
  const timersRef = useRef<ReturnType<typeof setTimeout>[]>([]);
  const prevRunningRef = useRef(false);

  const clearTimers = useCallback(() => {
    timersRef.current.forEach(clearTimeout);
    timersRef.current = [];
  }, []);

  // Start or resume simulation when isRunning transitions to true
  useEffect(() => {
    if (isRunning && !prevRunningRef.current) {
      setShowSuccess(false);
      setShowOutput(false);
      clearTimers();

      // Check if we're resuming after approval (steps already exist with an active action step)
      const activeIdx = steps.findIndex((s) => s.status === "active");
      const isResuming = steps.length > 0 && activeIdx > 0;

      if (isResuming) {
        // Resuming: schedule remaining steps up to (but not including) "done".
        // The last real step stays active until isRunning becomes false.
        const remaining = steps.slice(activeIdx);
        const realRemaining = remaining.filter((s) => s.id !== "done");
        let cumulative = 0;
        for (let i = 0; i < realRemaining.length - 1; i += 1) {
          cumulative += realRemaining[i].duration;
          const stepId = realRemaining[i].id;
          const nextStepId = realRemaining[i + 1].id;
          const t = setTimeout(() => {
            setSteps((prev) =>
              prev.map((s) => {
                if (s.id === stepId) return { ...s, status: "completed" };
                if (s.id === nextStepId) return { ...s, status: "active" };
                return s;
              })
            );
          }, cumulative);
          timersRef.current.push(t);
        }
      } else {
        // Fresh start: initialize all steps
        const defs = mode === "destroy" ? DESTROY_STEPS : mode === "apply" ? APPLY_STEPS : PLAN_STEPS;
        const initial: Step[] = defs.map((d, i) => ({
          ...d,
          status: i === 0 ? "active" : "pending"
        }));
        setSteps(initial);

        // Schedule timed transitions up to the second-to-last real step.
        // The last real step (before "done") stays active until isRunning becomes false.
        const realDefs = defs.filter((d) => d.id !== "done");
        let cumulative = 0;
        for (let i = 0; i < realDefs.length - 1; i += 1) {
          cumulative += realDefs[i].duration;
          const idx = i;
          const t = setTimeout(() => {
            setSteps((prev) =>
              prev.map((s, j) => {
                if (j === idx) return { ...s, status: "completed" };
                if (j === idx + 1) return { ...s, status: "active" };
                return s;
              })
            );
          }, cumulative);
          timersRef.current.push(t);
        }
      }
    }
    prevRunningRef.current = isRunning;
  }, [isRunning, mode, clearTimers]); // eslint-disable-line react-hooks/exhaustive-deps

  // Finalize when isRunning transitions to false (and we have steps)
  useEffect(() => {
    if (!isRunning && steps.length > 0 && steps[0].status !== "pending") {
      clearTimers();

      if (awaitingApproval) {
        // Pause: mark everything before the action step as completed, keep action step active
        const actionStepId = mode === "destroy" ? "destroy" : "apply";
        setSteps((prev) =>
          prev.map((s) => {
            if (s.id === actionStepId) return { ...s, status: "active" };
            if (s.id === "done") return s;
            if (s.status !== "completed") return { ...s, status: "completed" };
            return s;
          })
        );
      } else {
        const failed = output.includes("Error");
        // Mark all steps as completed/failed immediately — "done" goes
        // straight to completed (no active spinner), it's just a checkmark.
        setSteps((prev) =>
          prev.map((s) => {
            if (s.status === "active" || s.status === "pending" || s.id === "done") {
              return { ...s, status: failed ? "failed" : "completed" };
            }
            return s;
          })
        );
        if (!failed) {
          setShowSuccess(true);
        }
      }
    }
  }, [isRunning, awaitingApproval, steps.length > 0, output, clearTimers]); // eslint-disable-line react-hooks/exhaustive-deps

  // Cleanup on unmount
  useEffect(() => clearTimers, [clearTimers]);

  const isDone = !isRunning && steps.length > 0 && !awaitingApproval;
  const hasFailed = steps.some((s) => s.status === "failed");

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="fixed inset-0 z-40 bg-black/40 backdrop-blur-sm"
            onClick={onClose}
          />

          {/* Panel */}
          <motion.div
            initial={{ x: "100%", opacity: 0 }}
            animate={{ x: 0, opacity: 1 }}
            exit={{ x: "100%", opacity: 0 }}
            transition={{ type: "spring", damping: 28, stiffness: 260 }}
            className="fixed top-4 right-4 bottom-4 z-50 flex w-[480px] max-w-[calc(100vw-2rem)] flex-col overflow-hidden rounded-xl border border-mineshaft-600 bg-mineshaft-900/95 shadow-2xl shadow-black/40 backdrop-blur-md"
          >
            {/* Success shimmer */}
            {showSuccess && (
              <motion.div
                className="pointer-events-none absolute inset-0 bg-gradient-to-r from-transparent via-green-500/10 to-transparent"
                initial={{ x: "-100%" }}
                animate={{ x: "200%" }}
                transition={{ duration: 1.2, ease: "easeInOut" }}
              />
            )}

            {/* Header */}
            <div className="flex shrink-0 items-center justify-between border-b border-mineshaft-600 px-4 py-3">
              <div className="flex items-center gap-2.5">
                <Badge variant={mode === "destroy" ? "danger" : mode === "apply" ? "success" : "info"}>
                  {mode === "destroy" ? "Destroy" : mode === "apply" ? "Apply" : "Plan"}
                </Badge>
                {isRunning && (
                  <span className="text-xs text-mineshaft-400 animate-pulse">Running...</span>
                )}
                {isDone && !hasFailed && (
                  <motion.span
                    initial={{ opacity: 0, x: -10 }}
                    animate={{ opacity: 1, x: 0 }}
                    className="text-xs text-green-400"
                  >
                    Completed
                  </motion.span>
                )}
                {isDone && hasFailed && (
                  <motion.span
                    initial={{ opacity: 0, x: -10 }}
                    animate={{ opacity: 1, x: 0 }}
                    className="text-xs text-red-400"
                  >
                    Failed
                  </motion.span>
                )}
              </div>
              <button
                type="button"
                onClick={onClose}
                className="rounded-md p-1 text-mineshaft-500 transition-colors hover:bg-mineshaft-700 hover:text-mineshaft-200"
              >
                <XIcon className="size-4" />
              </button>
            </div>

            {/* Scrollable body */}
            <div className="flex-1 overflow-y-auto px-4 py-4">
              {/* Steps */}
              <div>
                {steps.map((step, i) => (
                  <div key={step.id}>
                    <motion.div
                      initial={{ opacity: 0, x: 20 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: i * 0.08, duration: 0.3 }}
                      className="flex items-center gap-3"
                    >
                      <StepIndicator status={step.status} />
                      <span
                        className={`text-sm font-medium transition-colors duration-500 ${
                          step.status === "active"
                            ? "text-primary"
                            : step.status === "completed"
                              ? "text-green-400"
                              : step.status === "failed"
                                ? "text-red-400"
                                : "text-mineshaft-500"
                        }`}
                      >
                        {step.label}
                      </span>
                    </motion.div>
                    {i < steps.length - 1 && (
                      <ConnectorLine filled={step.status === "completed"} />
                    )}
                  </div>
                ))}
              </div>

              {/* Approval gate */}
              {awaitingApproval && (
                <motion.div
                  initial={{ opacity: 0, y: 15 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.2 }}
                  className="mt-5 overflow-hidden rounded-lg border border-red-500/30"
                >
                  <div className="bg-gradient-to-b from-red-500/10 to-transparent p-4">
                    <div className="mb-3 flex items-center gap-2">
                      <ShieldAlertIcon className="size-4 text-red-400" />
                      <span className="text-sm font-semibold text-red-400">
                        {mode === "destroy" ? "Destroy Confirmation" : "Approval Required"}
                      </span>
                    </div>
                    {mode === "destroy" && (
                      <p className="mb-3 text-xs text-red-300/80">
                        This will permanently destroy all managed resources. This action cannot be undone.
                      </p>
                    )}
                    {aiInsight?.security.issues.map((issue, idx) => (
                      // eslint-disable-next-line react/no-array-index-key
                      <div key={idx} className="mb-2 flex items-start gap-2 text-xs">
                        <Badge
                          variant={
                            issue.severity === "critical" || issue.severity === "high"
                              ? "danger"
                              : "warning"
                          }
                        >
                          {issue.severity}
                        </Badge>
                        <div>
                          <p className="font-medium text-mineshaft-200">{issue.resource}</p>
                          <p className="text-mineshaft-400">{issue.description}</p>
                        </div>
                      </div>
                    ))}
                    <div className="mt-4 flex gap-2">
                      <Button variant={mode === "destroy" ? "danger" : "success"} size="sm" onClick={onApprove} className="flex-1">
                        {mode === "destroy" ? "Approve & Destroy" : "Approve & Apply"}
                      </Button>
                      <Button variant="outline" size="sm" onClick={onDeny} className="flex-1">
                        Deny
                      </Button>
                    </div>
                  </div>
                </motion.div>
              )}

              {/* Results */}
              {isDone && !hasFailed && (
                <motion.div
                  initial={{ opacity: 0, y: 15 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.2 }}
                  className="mt-5 space-y-3"
                >
                  {/* Plan change badges */}
                  {planJson && (
                    <div className="flex items-center gap-2 rounded-lg border border-mineshaft-600 bg-mineshaft-800/50 p-3">
                      <Badge variant="success">+{planJson.add} add</Badge>
                      <Badge variant="warning">~{planJson.change} change</Badge>
                      <Badge variant="danger">-{planJson.destroy} destroy</Badge>
                    </div>
                  )}

                  {/* Topology graph (compact, run-specific) */}
                  {planJson && planJson.resources.length > 0 && (() => {
                    const runGraph = buildGraphFromPlanJson(planJson);
                    return runGraph.nodes.length > 0 ? (
                      <motion.div
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: 0.3 }}
                      >
                        <ResourceTopologyGraph
                          nodes={runGraph.nodes}
                          edges={runGraph.edges}
                          actionMap={planJson.resources.reduce<Record<string, string>>(
                            (acc, r) => ({ ...acc, [r.address]: r.action }),
                            {}
                          )}
                          compact
                          animate
                          className="h-48"
                        />
                      </motion.div>
                    ) : null;
                  })()}

                  {/* AI Insight */}
                  {aiInsight && (
                    <motion.div
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: 0.4 }}
                      className="rounded-lg border border-primary/20 bg-primary/5 p-3"
                    >
                      <div className="mb-2 flex items-center gap-1.5 text-xs font-medium text-primary">
                        <SparklesIcon className="size-3" />
                        AI Analysis
                      </div>
                      <div className="prose prose-invert prose-xs max-w-none text-xs text-mineshaft-300">
                        <ReactMarkdown>{aiInsight.summary}</ReactMarkdown>
                      </div>

                      {/* Costs */}
                      {(aiInsight.costs.estimated.length > 0 ||
                        aiInsight.costs.aiEstimated.length > 0) && (
                        <div className="mt-3 border-t border-primary/10 pt-3">
                          <p className="mb-1 text-[11px] font-semibold uppercase tracking-wider text-mineshaft-400">
                            Cost Estimate
                          </p>
                          <p className="mb-1 text-xs text-mineshaft-200">
                            {aiInsight.costs.totalMonthly}/mo ({aiInsight.costs.deltaMonthly} delta)
                          </p>
                          {[...aiInsight.costs.estimated, ...aiInsight.costs.aiEstimated].map(
                            (c, idx) => (
                              // eslint-disable-next-line react/no-array-index-key
                              <div
                                key={idx}
                                className="flex justify-between text-[11px] text-mineshaft-400"
                              >
                                <span>{c.resource}</span>
                                <span>{c.monthlyCost}</span>
                              </div>
                            )
                          )}
                        </div>
                      )}

                      {/* Security */}
                      {aiInsight.security.issues.length > 0 && (
                        <div className="mt-3 border-t border-primary/10 pt-3">
                          <p className="mb-1 text-[11px] font-semibold uppercase tracking-wider text-mineshaft-400">
                            Security
                          </p>
                          {aiInsight.security.issues.map((issue, idx) => (
                            // eslint-disable-next-line react/no-array-index-key
                            <div key={idx} className="mb-1 text-xs">
                              <Badge
                                variant={
                                  issue.severity === "critical" || issue.severity === "high"
                                    ? "danger"
                                    : "warning"
                                }
                                className="mr-1"
                              >
                                {issue.severity}
                              </Badge>
                              <span className="text-mineshaft-300">{issue.description}</span>
                            </div>
                          ))}
                        </div>
                      )}
                    </motion.div>
                  )}
                </motion.div>
              )}

              {/* Error summary */}
              {isDone && hasFailed && output && (() => {
                const errorText = extractError(output);
                return errorText ? (
                  <motion.div
                    initial={{ opacity: 0, y: 15 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.2 }}
                    className="mt-5 overflow-hidden rounded-lg border border-red-500/30"
                  >
                    <div className="bg-gradient-to-b from-red-500/10 to-transparent p-4">
                      <div className="mb-2 flex items-center gap-2">
                        <XIcon className="size-4 text-red-400" />
                        <span className="text-sm font-semibold text-red-400">Error</span>
                      </div>
                      <pre className="whitespace-pre-wrap font-mono text-xs text-red-200/80">
                        {errorText}
                      </pre>
                    </div>
                  </motion.div>
                ) : null;
              })()}

              {/* Terminal output (collapsible) */}
              {output && (
                <div className="mt-4 overflow-hidden rounded-lg border border-mineshaft-600">
                  <button
                    type="button"
                    onClick={() => setShowOutput(!showOutput)}
                    className="flex w-full items-center gap-2 bg-mineshaft-800 px-3 py-2 text-xs text-mineshaft-400 transition-colors hover:text-mineshaft-200"
                  >
                    <TerminalIcon className="size-3" />
                    <span>Terminal Output</span>
                    <ChevronDownIcon
                      className={`ml-auto size-3 transition-transform duration-200 ${showOutput ? "rotate-180" : ""}`}
                    />
                  </button>
                  <AnimatePresence>
                    {showOutput && (
                      <motion.div
                        initial={{ height: 0 }}
                        animate={{ height: "auto" }}
                        exit={{ height: 0 }}
                        transition={{ duration: 0.2 }}
                        className="overflow-hidden"
                      >
                        <pre
                          className="max-h-72 overflow-auto bg-[#1e1e1e] p-3 font-mono text-xs text-mineshaft-200"
                          dangerouslySetInnerHTML={{ __html: ansiUp.ansi_to_html(output) }}
                        />
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              )}
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
};
