import { AlertTriangleIcon, ClockIcon, CornerDownRightIcon, SparklesIcon, XCircleIcon } from "lucide-react";

import { Spinner } from "@app/components/v2";
import { PamSessionStatus, TPamSession } from "@app/hooks/api/pam";

type Props = {
  session: TPamSession;
  onWarningClick?: (logIndex: number) => void;
};

export const PamSessionAiInsightsSection = ({ session, onWarningClick }: Props) => {
  const { aiInsightsStatus, aiInsightsError, aiInsights } = session;

  const isEnded = session.status === PamSessionStatus.Ended || session.status === PamSessionStatus.Terminated;

  // Only show if:
  // 1. Session is ended AND has an aiInsightsStatus, OR
  // 2. Session has completed insights
  if (!isEnded && !aiInsightsStatus) return null;
  if (isEnded && !aiInsightsStatus) return null;

  return (
    <div className="rounded-lg border border-mineshaft-600 bg-mineshaft-900 p-4">
      <div className="flex items-center gap-2 border-b border-mineshaft-400 pb-3">
        <SparklesIcon className="size-4 text-purple-400" />
        <h3 className="text-base font-medium text-mineshaft-100">AI Insights</h3>
      </div>

      <div className="pt-3">
        {aiInsightsStatus === "pending" && (
          <div className="flex items-center gap-2 text-sm text-mineshaft-300">
            <Spinner size="xs" />
            <span>Generating summary...</span>
          </div>
        )}

        {aiInsightsStatus === "failed" && (
          <div className="flex flex-col gap-2">
            <div className="flex items-center gap-2 text-red-400">
              <XCircleIcon className="size-4 shrink-0" />
              <span className="text-sm font-medium">Summarization failed</span>
            </div>
            {aiInsightsError && (
              <p className="text-xs text-mineshaft-400">{aiInsightsError}</p>
            )}
          </div>
        )}

        {aiInsightsStatus === "completed" && aiInsights && (
          <div className="flex flex-col gap-3">
            <p className="text-sm leading-relaxed text-mineshaft-200">{aiInsights.summary}</p>

            {aiInsights.warnings.length > 0 && (
              <div className="flex flex-col gap-2">
                <div className="flex items-center gap-1.5 text-amber-400">
                  <AlertTriangleIcon className="size-3.5" />
                  <span className="text-xs font-semibold uppercase tracking-wide">Warnings</span>
                </div>
                <ul className="flex list-disc flex-col gap-1 pl-4">
                  {aiInsights.warnings.map((warning, i) => (
                    // eslint-disable-next-line react/no-array-index-key
                    <li key={i} className="text-xs text-amber-300">
                      {warning.logIndex != null && onWarningClick ? (
                        <button
                          type="button"
                          className="inline-flex items-center gap-1.5 text-left underline decoration-dotted underline-offset-2 hover:decoration-solid"
                          onClick={() => onWarningClick(warning.logIndex!)}
                        >
                          {warning.text}
                          <CornerDownRightIcon className="size-3 shrink-0 opacity-70" />
                        </button>
                      ) : (
                        warning.text
                      )}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {aiInsights.warnings.length === 0 && (
              <p className="text-xs text-mineshaft-500">No security concerns detected.</p>
            )}
          </div>
        )}

        {aiInsightsStatus === "completed" && !aiInsights && (
          <div className="flex items-center gap-2 text-sm text-mineshaft-400">
            <ClockIcon className="size-4" />
            <span>No summary available</span>
          </div>
        )}
      </div>

      <div className="mt-4 border-t border-mineshaft-600 pt-3">
        <p className="text-center text-xs italic text-mineshaft-400">
          Results are produced by a language model and may not be fully accurate.
        </p>
      </div>
    </div>
  );
};
