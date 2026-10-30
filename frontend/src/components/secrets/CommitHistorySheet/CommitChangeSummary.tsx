import { CommitChangeSummary } from "@app/hooks/api/folderCommits";

type ChangeKind = {
  count: number;
  symbol: string;
  label: string;
  className: string;
};

const getChangeKinds = (summary: CommitChangeSummary): ChangeKind[] =>
  [
    { count: summary.addedCount, symbol: "+", label: "added", className: "text-success" },
    { count: summary.updatedCount, symbol: "~", label: "updated", className: "text-warning" },
    { count: summary.deletedCount, symbol: "-", label: "deleted", className: "text-danger" }
  ].filter((kind) => kind.count > 0);

export const CommitChangeSummaryText = ({
  summary,
  showLabels = false
}: {
  summary: CommitChangeSummary;
  showLabels?: boolean;
}) => {
  const kinds = getChangeKinds(summary);

  if (!kinds.length) return null;

  return (
    <div className="flex shrink-0 items-center gap-2 text-xs">
      {kinds.map((kind) => (
        <span key={kind.label} className={kind.className}>
          <span className="font-mono">
            {kind.symbol}
            {kind.count}
          </span>
          {showLabels && ` ${kind.label}`}
        </span>
      ))}
    </div>
  );
};

export const formatCommitResourceSummary = (summary: CommitChangeSummary) =>
  [
    { count: summary.secretCount, singular: "secret" },
    { count: summary.folderCount, singular: "folder" }
  ]
    .filter((resource) => resource.count > 0)
    .map(
      (resource) =>
        `${resource.count} ${resource.count === 1 ? resource.singular : `${resource.singular}s`}`
    )
    .join(", ");
