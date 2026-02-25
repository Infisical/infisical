import { AnsiUp } from "ansi_up";
import { diffLines } from "diff";
import { useEffect, useMemo, useState } from "react";
import ReactMarkdown from "react-markdown";
import { useNavigate, useParams } from "@tanstack/react-router";
import {
  AlertTriangleIcon,
  ArrowLeftIcon,
  ChevronDownIcon,
  ChevronRightIcon,
  CircleXIcon,
  ClockIcon,
  DollarSignIcon,
  FileIcon,
  ShieldAlertIcon,
  SparklesIcon,
  TerminalIcon
} from "lucide-react";

import {
  Badge,
  Button,
  Skeleton,
  UnstableCard,
  UnstableCardContent,
  UnstableCardHeader,
  UnstableCardTitle
} from "@app/components/v3";
import { useProject } from "@app/context";
import { useApproveInfraRun, useDenyInfraRun, useInfraRun } from "@app/hooks/api/infra";
import { TAiInsight, TPlanJson } from "@app/hooks/api/infra/types";

const statusVariant = (status: string): "success" | "danger" | "warning" | "info" => {
  switch (status) {
    case "success":
      return "success";
    case "failed":
      return "danger";
    case "running":
      return "warning";
    case "awaiting_approval":
      return "warning";
    default:
      return "info";
  }
};

const formatDate = (dateStr: string) => {
  const d = new Date(dateStr);
  return d.toLocaleString();
};

const actionColor = (action: string) => {
  if (action === "create") return "text-green-400";
  if (action === "delete") return "text-red-400";
  if (action === "update") return "text-yellow-400";
  return "text-mineshaft-300";
};

const actionLabel = (action: string) => {
  if (action === "create") return "+";
  if (action === "delete") return "-";
  if (action === "update") return "~";
  return "?";
};

const FileDiffView = ({
  oldText,
  newText,
  isNew,
  isDeleted,
  isUnchanged
}: {
  oldText: string;
  newText: string;
  isNew: boolean;
  isDeleted: boolean;
  isUnchanged: boolean;
}) => {
  // New file: single panel, all lines green
  if (isNew) {
    const lines = newText.split("\n");
    return (
      <div className="font-mono text-xs">
        {lines.map((line, i) => (
          // eslint-disable-next-line react/no-array-index-key
          <div key={i} className="flex bg-green-500/20">
            <span className="w-10 shrink-0 border-r border-green-800/30 pr-2 text-right text-green-600 select-none">
              {i + 1}
            </span>
            <span className="w-6 shrink-0 text-center text-green-500 select-none">+</span>
            <span className="flex-1 whitespace-pre text-green-300">{line}</span>
          </div>
        ))}
      </div>
    );
  }

  // Deleted file: single panel, all lines red
  if (isDeleted) {
    const lines = oldText.split("\n");
    return (
      <div className="font-mono text-xs">
        {lines.map((line, i) => (
          // eslint-disable-next-line react/no-array-index-key
          <div key={i} className="flex bg-red-500/20">
            <span className="w-10 shrink-0 border-r border-red-800/30 pr-2 text-right text-red-600 select-none">
              {i + 1}
            </span>
            <span className="w-6 shrink-0 text-center text-red-500 select-none">-</span>
            <span className="flex-1 whitespace-pre text-red-300">{line}</span>
          </div>
        ))}
      </div>
    );
  }

  // Unchanged file: single panel, plain text
  if (isUnchanged) {
    const lines = newText.split("\n");
    return (
      <div className="font-mono text-xs">
        {lines.map((line, i) => (
          // eslint-disable-next-line react/no-array-index-key
          <div key={i} className="flex">
            <span className="w-10 shrink-0 border-r border-mineshaft-700 pr-2 text-right text-mineshaft-600 select-none">
              {i + 1}
            </span>
            <span className="w-6 shrink-0" />
            <span className="flex-1 whitespace-pre text-mineshaft-300">{line}</span>
          </div>
        ))}
      </div>
    );
  }

  // Modified file: inline diff with green/red highlights
  const changes = diffLines(oldText, newText);
  let oldLineNum = 1;
  let newLineNum = 1;

  return (
    <div className="font-mono text-xs">
      {changes.map((change, ci) => {
        const lines = change.value.split("\n");
        // Remove trailing empty string from split
        if (lines.length > 0 && lines[lines.length - 1] === "") lines.pop();

        return lines.map((line, li) => {
          // eslint-disable-next-line react/no-array-index-key
          const key = `${ci}-${li}`;
          if (change.added) {
            const ln = newLineNum;
            newLineNum += 1;
            return (
              <div key={key} className="flex bg-green-500/20">
                <span className="w-10 shrink-0 border-r border-green-800/30 pr-2 text-right text-green-600 select-none">
                  {ln}
                </span>
                <span className="w-6 shrink-0 text-center text-green-500 select-none">+</span>
                <span className="flex-1 whitespace-pre text-green-300">{line}</span>
              </div>
            );
          }
          if (change.removed) {
            const ln = oldLineNum;
            oldLineNum += 1;
            return (
              <div key={key} className="flex bg-red-500/20">
                <span className="w-10 shrink-0 border-r border-red-800/30 pr-2 text-right text-red-600 select-none">
                  {ln}
                </span>
                <span className="w-6 shrink-0 text-center text-red-500 select-none">-</span>
                <span className="flex-1 whitespace-pre text-red-300">{line}</span>
              </div>
            );
          }
          // Unchanged context line
          const nln = newLineNum;
          oldLineNum += 1;
          newLineNum += 1;
          return (
            <div key={key} className="flex">
              <span className="w-10 shrink-0 border-r border-mineshaft-700 pr-2 text-right text-mineshaft-600 select-none">
                {nln}
              </span>
              <span className="w-6 shrink-0" />
              <span className="flex-1 whitespace-pre text-mineshaft-300">{line}</span>
            </div>
          );
        });
      })}
    </div>
  );
};

const ansiUp = new AnsiUp();
ansiUp.use_classes = false;

/** Strip ANSI escape codes for plain text matching */
const stripAnsi = (str: string) => str.replace(/\x1b\[[0-9;]*m/g, "");

/**
 * Parse logs to extract error blocks for a concise error summary.
 * Captures everything from the first error marker up to the
 * "[infra] Error: tofu exited with code" sentinel (excluded).
 */
const extractErrors = (logs: string): string[] => {
  const plain = stripAnsi(logs);
  const lines = plain.split("\n");

  // Find the sentinel line and the first error marker
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

  if (startIdx === -1) return [];

  // Collect the error text, trimming trailing blank lines
  const block = lines.slice(startIdx, endIdx);
  while (block.length > 0 && block[block.length - 1].trim() === "") {
    block.pop();
  }

  return block.length > 0 ? [block.join("\n")] : [];
};

export const InfraRunDetailPage = () => {
  const { currentProject } = useProject();
  const params = useParams({
    from: "/_authenticate/_inject-org-details/_org-layout/organizations/$orgId/projects/infra/$projectId/_infra-layout/run/$runId"
  });
  const navigate = useNavigate();
  const { data: run, isLoading } = useInfraRun(currentProject.id, params.runId);
  const approveRun = useApproveInfraRun();
  const denyRun = useDenyInfraRun();

  const [activeTab, setActiveTab] = useState<"changes" | "logs" | "ai">("changes");

  useEffect(() => {
    if (run?.status === "failed" && activeTab === "changes") {
      setActiveTab("logs");
    }
  }, [run?.status]);
  const [expandedFile, setExpandedFile] = useState<string | null>(null);

  // Parse AI insight from stored JSON string
  const aiInsight = useMemo<TAiInsight | null>(() => {
    if (!run?.aiSummary) return null;
    try {
      return JSON.parse(run.aiSummary) as TAiInsight;
    } catch {
      return {
        summary: run.aiSummary,
        costs: { estimated: [], aiEstimated: [], totalMonthly: "N/A", deltaMonthly: "N/A" },
        security: { issues: [], shouldApprove: false }
      };
    }
  }, [run?.aiSummary]);

  const planJson = useMemo<TPlanJson | null>(() => {
    if (!run?.planJson) return null;
    return run.planJson as TPlanJson;
  }, [run?.planJson]);

  const fileSnapshot = useMemo<Record<string, string> | null>(() => {
    if (!run?.fileSnapshot) return null;
    return run.fileSnapshot as Record<string, string>;
  }, [run?.fileSnapshot]);

  const previousFileSnapshot = useMemo<Record<string, string> | null>(() => {
    if (!run?.previousFileSnapshot) return null;
    return run.previousFileSnapshot as Record<string, string>;
  }, [run?.previousFileSnapshot]);

  const handleApprove = async () => {
    if (!run) return;
    await approveRun.mutateAsync({ projectId: currentProject.id, runId: run.id });
  };

  const handleDeny = async () => {
    if (!run) return;
    await denyRun.mutateAsync({ projectId: currentProject.id, runId: run.id });
  };

  if (isLoading) {
    return (
      <div className="flex flex-col gap-4">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-[400px] w-full" />
      </div>
    );
  }

  if (!run) {
    return (
      <div className="flex flex-col items-center gap-4 pt-20">
        <p className="text-mineshaft-400">Run not found.</p>
        <Button variant="outline" size="sm" onClick={() => navigate({ to: "../../runs" })}>
          Back to Runs
        </Button>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <button
            type="button"
            className="mb-2 flex items-center gap-1.5 text-xs text-mineshaft-400 hover:text-mineshaft-200"
            onClick={() => navigate({ to: "../../runs" })}
          >
            <ArrowLeftIcon className="size-3" />
            Back to Runs
          </button>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-semibold text-mineshaft-100">
              Run <span className="font-mono text-lg text-mineshaft-300">{run.id.slice(0, 8)}</span>
            </h1>
            <Badge variant={run.type === "apply" ? "success" : "info"}>{run.type}</Badge>
            <Badge variant={statusVariant(run.status)}>{run.status}</Badge>
          </div>
          <div className="mt-1 flex items-center gap-3 text-xs text-mineshaft-400">
            <span className="flex items-center gap-1">
              <ClockIcon className="size-3" />
              {formatDate(run.createdAt)}
            </span>
            {run.triggeredBy && <span>Triggered by: {run.triggeredBy.slice(0, 8)}</span>}
          </div>
        </div>

        {/* Approval actions */}
        {run.status === "awaiting_approval" && (
          <div className="flex items-center gap-2">
            <Button
              variant="success"
              size="sm"
              onClick={handleApprove}
              isPending={approveRun.isPending}
            >
              Approve & Apply
            </Button>
            <Button variant="outline" size="sm" onClick={handleDeny} isPending={denyRun.isPending}>
              Deny
            </Button>
          </div>
        )}
      </div>

      {/* Resource changes summary */}
      {planJson && (
        <div className="flex gap-4">
          <UnstableCard className="flex-1">
            <UnstableCardContent className="flex items-center gap-3 p-4">
              <div className="rounded-lg bg-green-500/10 p-2.5">
                <span className="text-lg font-bold text-green-400">+{planJson.add}</span>
              </div>
              <span className="text-sm text-mineshaft-400">to add</span>
            </UnstableCardContent>
          </UnstableCard>
          <UnstableCard className="flex-1">
            <UnstableCardContent className="flex items-center gap-3 p-4">
              <div className="rounded-lg bg-yellow-500/10 p-2.5">
                <span className="text-lg font-bold text-yellow-400">~{planJson.change}</span>
              </div>
              <span className="text-sm text-mineshaft-400">to change</span>
            </UnstableCardContent>
          </UnstableCard>
          <UnstableCard className="flex-1">
            <UnstableCardContent className="flex items-center gap-3 p-4">
              <div className="rounded-lg bg-red-500/10 p-2.5">
                <span className="text-lg font-bold text-red-400">-{planJson.destroy}</span>
              </div>
              <span className="text-sm text-mineshaft-400">to destroy</span>
            </UnstableCardContent>
          </UnstableCard>
        </div>
      )}

      {/* Tabs */}
      <div className="flex border-b border-mineshaft-600">
        {(["changes", "logs", "ai"] as const)
          .filter((tab) => !(tab === "changes" && run.status === "failed"))
          .map((tab) => (
            <button
              key={tab}
              type="button"
              className={`border-b-2 px-4 py-2.5 text-sm font-medium transition-colors ${
                activeTab === tab
                  ? "border-primary text-mineshaft-100"
                  : "border-transparent text-mineshaft-400 hover:text-mineshaft-200"
              }`}
              onClick={() => setActiveTab(tab)}
            >
              {tab === "changes" && "Changes"}
              {tab === "logs" && "Logs"}
              {tab === "ai" && (
                <span className="flex items-center gap-1.5">
                  <SparklesIcon className="size-3" />
                  AI Analysis
                </span>
              )}
            </button>
          ))}
      </div>

      {/* Tab content */}
      {activeTab === "changes" && (
        <div className="flex flex-col gap-4">
          {/* Resource changes list */}
          {planJson?.resources && planJson.resources.length > 0 && (
            <UnstableCard>
              <UnstableCardHeader className="pb-2">
                <UnstableCardTitle className="text-sm font-medium text-mineshaft-200">
                  Resource Changes
                </UnstableCardTitle>
              </UnstableCardHeader>
              <UnstableCardContent className="p-0">
                <div className="divide-y divide-mineshaft-600">
                  {planJson.resources.map((res) => (
                    <div key={res.address} className="flex items-center gap-3 px-4 py-2.5 text-sm">
                      <span className={`font-mono text-base font-bold ${actionColor(res.action)}`}>
                        {actionLabel(res.action)}
                      </span>
                      <div className="flex-1">
                        <span className="font-mono text-xs text-mineshaft-200">{res.address}</span>
                        <span className="ml-2 text-xs text-mineshaft-500">({res.type})</span>
                      </div>
                      <Badge
                        variant={
                          res.action === "create"
                            ? "success"
                            : res.action === "delete"
                              ? "danger"
                              : "warning"
                        }
                      >
                        {res.action}
                      </Badge>
                    </div>
                  ))}
                </div>
              </UnstableCardContent>
            </UnstableCard>
          )}

          {/* File snapshot diffs */}
          {run.status !== "failed" && fileSnapshot && Object.keys(fileSnapshot).length > 0 && (
            <UnstableCard>
              <UnstableCardHeader className="pb-2">
                <UnstableCardTitle className="text-sm font-medium text-mineshaft-200">
                  Files
                </UnstableCardTitle>
              </UnstableCardHeader>
              <UnstableCardContent className="p-0">
                <div className="divide-y divide-mineshaft-600">
                  {(() => {
                    const allFiles = new Set([
                      ...Object.keys(fileSnapshot),
                      ...(previousFileSnapshot ? Object.keys(previousFileSnapshot) : [])
                    ]);
                    return Array.from(allFiles).map((fileName) => {
                      const current = fileSnapshot[fileName] ?? "";
                      const previous = previousFileSnapshot?.[fileName] ?? "";
                      const isNew =
                        !previousFileSnapshot?.[fileName] && Boolean(fileSnapshot[fileName]);
                      const isDeleted =
                        Boolean(previousFileSnapshot?.[fileName]) && !fileSnapshot[fileName];
                      const isModified = current !== previous && !isNew && !isDeleted;
                      const isUnchanged = current === previous;
                      return (
                        <div key={fileName}>
                          <button
                            type="button"
                            className="flex w-full items-center gap-2 px-4 py-2.5 text-left text-sm hover:bg-mineshaft-700/30"
                            onClick={() =>
                              setExpandedFile(expandedFile === fileName ? null : fileName)
                            }
                          >
                            {expandedFile === fileName ? (
                              <ChevronDownIcon className="size-3.5 text-mineshaft-400" />
                            ) : (
                              <ChevronRightIcon className="size-3.5 text-mineshaft-400" />
                            )}
                            <FileIcon className="size-3.5 text-mineshaft-500" />
                            <span className="font-mono text-xs text-mineshaft-200">{fileName}</span>
                            {isNew && <Badge variant="success">new</Badge>}
                            {isDeleted && <Badge variant="danger">deleted</Badge>}
                            {isModified && <Badge variant="warning">modified</Badge>}
                            {isUnchanged && (
                              <span className="text-xs text-mineshaft-600">unchanged</span>
                            )}
                          </button>
                          {expandedFile === fileName && (
                            <div className="max-h-[400px] overflow-auto border-t border-mineshaft-600 bg-[#1e1e1e]">
                              <FileDiffView
                                oldText={previous}
                                newText={current}
                                isNew={isNew}
                                isDeleted={isDeleted}
                                isUnchanged={isUnchanged}
                              />
                            </div>
                          )}
                        </div>
                      );
                    });
                  })()}
                </div>
              </UnstableCardContent>
            </UnstableCard>
          )}

          {!planJson?.resources?.length && !fileSnapshot && (
            <div className="rounded-lg border border-dashed border-mineshaft-600 p-8 text-center text-sm text-mineshaft-400">
              No change details available for this run.
            </div>
          )}
        </div>
      )}

      {activeTab === "logs" && (
        <div className="flex flex-col gap-4">
          {/* Error summary for failed runs */}
          {run.status === "failed" &&
            run.logs &&
            (() => {
              const errors = extractErrors(run.logs);
              if (errors.length === 0) return null;
              return (
                <UnstableCard className="border-red-500/30">
                  <UnstableCardHeader className="pb-2">
                    <UnstableCardTitle className="flex items-center gap-2 text-sm font-medium text-red-400">
                      <CircleXIcon className="size-4" />
                      {errors.length} Error{errors.length > 1 ? "s" : ""} Detected
                    </UnstableCardTitle>
                  </UnstableCardHeader>
                  <UnstableCardContent className="flex flex-col gap-2">
                    {errors.map((err, idx) => (
                      <pre
                        // eslint-disable-next-line react/no-array-index-key
                        key={idx}
                        className="overflow-auto rounded-md border border-red-500/20 bg-red-500/5 p-3 font-mono text-xs whitespace-pre-wrap text-red-300"
                      >
                        {err}
                      </pre>
                    ))}
                  </UnstableCardContent>
                </UnstableCard>
              );
            })()}

          <UnstableCard>
            <UnstableCardHeader className="pb-2">
              <UnstableCardTitle className="flex items-center gap-2 text-sm font-medium text-mineshaft-200">
                <TerminalIcon className="size-4" />
                Run Output
              </UnstableCardTitle>
            </UnstableCardHeader>
            <UnstableCardContent>
              {run.logs ? (
                <pre
                  className="max-h-[600px] overflow-auto rounded-md bg-[#1e1e1e] p-4 font-mono text-xs leading-5 text-mineshaft-300"
                  // eslint-disable-next-line react/no-danger
                  dangerouslySetInnerHTML={{ __html: ansiUp.ansi_to_html(run.logs) }}
                />
              ) : (
                <pre className="max-h-[600px] overflow-auto rounded-md bg-[#1e1e1e] p-4 font-mono text-xs text-mineshaft-500">
                  No logs available.
                </pre>
              )}
            </UnstableCardContent>
          </UnstableCard>
        </div>
      )}

      {activeTab === "ai" && (
        <div className="flex flex-col gap-4">
          {aiInsight ? (
            <>
              {/* Summary */}
              <UnstableCard>
                <UnstableCardHeader className="pb-2">
                  <UnstableCardTitle className="flex items-center gap-2 text-sm font-medium text-mineshaft-200">
                    <SparklesIcon className="size-4 text-primary" />
                    Summary
                  </UnstableCardTitle>
                </UnstableCardHeader>
                <UnstableCardContent>
                  <div className="prose prose-invert prose-sm max-w-none text-sm text-mineshaft-300">
                    <ReactMarkdown>{aiInsight.summary}</ReactMarkdown>
                  </div>
                </UnstableCardContent>
              </UnstableCard>

              {/* Cost Estimates */}
              {(aiInsight.costs.estimated.length > 0 || aiInsight.costs.aiEstimated.length > 0) && (
                <UnstableCard>
                  <UnstableCardHeader className="pb-2">
                    <UnstableCardTitle className="flex items-center gap-2 text-sm font-medium text-mineshaft-200">
                      <DollarSignIcon className="size-4 text-green-400" />
                      Cost Estimate
                    </UnstableCardTitle>
                  </UnstableCardHeader>
                  <UnstableCardContent>
                    <div className="mb-3 flex gap-6">
                      <div>
                        <p className="text-xs text-mineshaft-400">Monthly Total</p>
                        <p className="text-lg font-bold text-mineshaft-100">
                          {aiInsight.costs.totalMonthly}
                        </p>
                      </div>
                      <div>
                        <p className="text-xs text-mineshaft-400">Delta</p>
                        <p className="text-lg font-bold text-mineshaft-100">
                          {aiInsight.costs.deltaMonthly}
                        </p>
                      </div>
                    </div>

                    {aiInsight.costs.estimated.length > 0 && (
                      <div className="mb-3">
                        <p className="mb-1.5 text-[11px] font-semibold tracking-wider text-mineshaft-400 uppercase">
                          API-Based Estimates
                        </p>
                        <div className="space-y-1">
                          {aiInsight.costs.estimated.map((c, idx) => (
                            // eslint-disable-next-line react/no-array-index-key
                            <div key={idx} className="flex items-center justify-between text-sm">
                              <span className="text-mineshaft-300">{c.resource}</span>
                              <div className="flex items-center gap-2">
                                <span className="text-mineshaft-200">{c.monthlyCost}</span>
                                <Badge variant="info">{c.source}</Badge>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {aiInsight.costs.aiEstimated.length > 0 && (
                      <div>
                        <p className="mb-1.5 text-[11px] font-semibold tracking-wider text-mineshaft-400 uppercase">
                          AI Estimates
                        </p>
                        <div className="space-y-1">
                          {aiInsight.costs.aiEstimated.map((c, idx) => (
                            // eslint-disable-next-line react/no-array-index-key
                            <div key={idx} className="flex items-center justify-between text-sm">
                              <span className="text-mineshaft-300">{c.resource}</span>
                              <div className="flex items-center gap-2">
                                <span className="text-mineshaft-200">{c.monthlyCost}</span>
                                <Badge
                                  variant={
                                    c.confidence === "high"
                                      ? "success"
                                      : c.confidence === "medium"
                                        ? "warning"
                                        : "danger"
                                  }
                                >
                                  {c.confidence}
                                </Badge>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </UnstableCardContent>
                </UnstableCard>
              )}

              {/* Security */}
              {aiInsight.security.issues.length > 0 && (
                <UnstableCard
                  className={aiInsight.security.shouldApprove ? "border-red-500/30" : ""}
                >
                  <UnstableCardHeader className="pb-2">
                    <UnstableCardTitle className="flex items-center gap-2 text-sm font-medium text-mineshaft-200">
                      <ShieldAlertIcon className="size-4 text-red-400" />
                      Security Findings
                      {aiInsight.security.shouldApprove && (
                        <Badge variant="danger">Requires Approval</Badge>
                      )}
                    </UnstableCardTitle>
                  </UnstableCardHeader>
                  <UnstableCardContent>
                    <div className="space-y-3">
                      {aiInsight.security.issues.map((issue, idx) => (
                        // eslint-disable-next-line react/no-array-index-key
                        <div key={idx} className="rounded-md border border-mineshaft-600 p-3">
                          <div className="mb-1 flex items-center gap-2">
                            <Badge
                              variant={
                                issue.severity === "critical" || issue.severity === "high"
                                  ? "danger"
                                  : "warning"
                              }
                            >
                              {issue.severity}
                            </Badge>
                            <span className="font-mono text-xs text-mineshaft-300">
                              {issue.resource}
                            </span>
                          </div>
                          <p className="mb-1 text-sm text-mineshaft-300">{issue.description}</p>
                          <div className="flex items-start gap-1.5 text-xs text-mineshaft-400">
                            <AlertTriangleIcon className="mt-0.5 size-3 shrink-0" />
                            {issue.recommendation}
                          </div>
                        </div>
                      ))}
                    </div>
                  </UnstableCardContent>
                </UnstableCard>
              )}
            </>
          ) : (
            <div className="rounded-lg border border-dashed border-mineshaft-600 p-8 text-center text-sm text-mineshaft-400">
              No AI analysis available for this run.
            </div>
          )}
        </div>
      )}
    </div>
  );
};
