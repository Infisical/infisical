import { RefreshCwIcon, TriangleAlertIcon } from "lucide-react";

import { Button, Pagination, Tooltip, TooltipContent, TooltipTrigger } from "@app/components/v3";

import { MatchedCertificatesTable, TMatchedCertificateRow } from "./MatchedCertificatesTable";

type Props = {
  summary: string;
  rows: TMatchedCertificateRow[];
  totalCount: number;
  isLoading: boolean;
  isStale: boolean;
  isUnfinished: boolean;
  onReload: () => void;
  page: number;
  pageSize: number;
  onPageChange: (page: number) => void;
  emptyTitle: string;
  emptyDescription: string;
};

export const MatchedCertificatesPreview = ({
  summary,
  rows,
  totalCount,
  isLoading,
  isStale,
  isUnfinished,
  onReload,
  page,
  pageSize,
  onPageChange,
  emptyTitle,
  emptyDescription
}: Props) => {
  const reloadButton = (
    <Button
      type="button"
      size="xs"
      variant={isStale ? "warning" : "outline"}
      isDisabled={isLoading || isUnfinished}
      onClick={onReload}
    >
      <RefreshCwIcon className="size-3" />
      Reload Preview
      {isStale && <TriangleAlertIcon className="size-3" />}
    </Button>
  );

  return (
    <>
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-sm font-medium text-foreground">Matched Certificates</p>
          <p className="mt-0.5 text-xs text-muted">{summary}</p>
        </div>
        {isStale ? (
          <Tooltip>
            <TooltipTrigger asChild>
              <span>{reloadButton}</span>
            </TooltipTrigger>
            <TooltipContent>
              {isUnfinished
                ? "A filter is unfinished. Complete it, then reload the preview."
                : "Filters changed. Reload the preview to see what they match now."}
            </TooltipContent>
          </Tooltip>
        ) : (
          reloadButton
        )}
      </div>

      <div className="mt-3">
        <MatchedCertificatesTable
          rows={rows}
          isLoading={isLoading}
          emptyTitle={emptyTitle}
          emptyDescription={emptyDescription}
        />
        {totalCount > pageSize && (
          <Pagination
            className="mt-2"
            count={totalCount}
            page={page}
            perPage={pageSize}
            onChangePage={onPageChange}
            onChangePerPage={() => {}}
            perPageList={[pageSize]}
          />
        )}
      </div>
    </>
  );
};
