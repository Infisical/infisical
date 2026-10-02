import { Fragment, useState } from "react";
import { UseFormReturn, useWatch } from "react-hook-form";
import { FilterIcon, PlusIcon, RefreshCwIcon, TrashIcon, TriangleAlertIcon } from "lucide-react";

import { PkiSyncMatchedCertificatesTable } from "@app/components/pki-syncs/forms/PkiSyncMatchedCertificatesTable";
import {
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  Empty,
  EmptyDescription,
  EmptyMedia,
  Field,
  FieldContent,
  FieldError,
  FieldLabel,
  IconButton,
  Pagination,
  Tooltip,
  TooltipContent,
  TooltipTrigger
} from "@app/components/v3";
import { useListWorkspaceCertificates } from "@app/hooks/api";
import { CertStatus } from "@app/hooks/api/certificates/enums";

import { ApplicationFilterSelect, ProfileFilterSelect } from "./CertificateFilterSelects";
import {
  CERTIFICATE_FILTER_DEFINITIONS,
  hasUnfinishedFilter,
  NO_FILTERS_DESCRIPTION,
  TCertificateAlertForm,
  TCertificateFilterKind
} from "./types";

const MATCHED_PAGE_SIZE = 20;

const FILTER_KINDS = Object.keys(CERTIFICATE_FILTER_DEFINITIONS) as TCertificateFilterKind[];

type Props = { form: UseFormReturn<TCertificateAlertForm>; projectId: string };

export const FiltersStep = ({ form, projectId }: Props) => {
  const applicationIds = useWatch({ control: form.control, name: "applicationIds" });
  const profileIds = useWatch({ control: form.control, name: "profileIds" });
  const conditionNames = useWatch({ control: form.control, name: "conditionNames" });
  const filters = { applicationIds, profileIds };

  const [previewFilters, setPreviewFilters] = useState(filters);
  const [page, setPage] = useState(1);
  const isStale = JSON.stringify(filters) !== JSON.stringify(previewFilters);
  const isUnfinished = hasUnfinishedFilter(filters);

  const {
    data: preview,
    isFetching: isPreviewing,
    refetch: refetchPreview
  } = useListWorkspaceCertificates({
    projectId,
    offset: (page - 1) * MATCHED_PAGE_SIZE,
    limit: MATCHED_PAGE_SIZE,
    status: CertStatus.ACTIVE,
    applicationIds: previewFilters.applicationIds,
    profileIds: previewFilters.profileIds
  });

  const reloadPreview = () => {
    setPage(1);
    if (isStale) setPreviewFilters(filters);
    else refetchPreview().catch(() => {});
  };

  const setFilter = (kind: TCertificateFilterKind, ids: string[] | undefined) =>
    form.setValue(kind, ids, { shouldDirty: true, shouldValidate: true });
  const addFilter = (kind: TCertificateFilterKind) =>
    form.setValue(kind, [], { shouldDirty: true });

  const presentKinds = FILTER_KINDS.filter((kind) => filters[kind] !== undefined);
  const addableKinds = FILTER_KINDS.filter((kind) => filters[kind] === undefined);

  const matchedCount = preview?.totalCount ?? 0;
  const isPreviewFiltered = FILTER_KINDS.some((kind) => previewFilters[kind] !== undefined);
  const certificatesLabel = `${matchedCount} active certificate${matchedCount === 1 ? "" : "s"}`;
  let previewSummary = "Loading the certificates this alert covers.";
  if (preview && !isPreviewing) {
    previewSummary = isPreviewFiltered
      ? `${certificatesLabel} ${matchedCount === 1 ? "matches" : "match"} these filters.`
      : `${certificatesLabel} in Certificate Manager.`;
  }

  const reloadButton = (
    <Button
      type="button"
      size="xs"
      variant={isStale ? "warning" : "outline"}
      isDisabled={isPreviewing || isUnfinished}
      onClick={reloadPreview}
    >
      <RefreshCwIcon className="size-3" />
      Reload Preview
      {isStale && <TriangleAlertIcon className="size-3" />}
    </Button>
  );

  return (
    <div className="flex flex-col">
      <div>
        <p className="text-sm font-medium text-foreground">Filters</p>
        <p className="mt-0.5 text-xs text-muted">
          A certificate is covered only when it matches every filter below.
        </p>
      </div>

      {presentKinds.length > 0 ? (
        <div className="mt-3 flex flex-col gap-3">
          {presentKinds.map((kind, index) => {
            const Select =
              kind === "applicationIds" ? ApplicationFilterSelect : ProfileFilterSelect;
            const { label } = CERTIFICATE_FILTER_DEFINITIONS[kind];
            return (
              <Fragment key={kind}>
                {index > 0 && (
                  <div className="flex items-center gap-3">
                    <span className="h-px flex-1 bg-border" />
                    <span className="text-xs font-medium text-muted">AND</span>
                    <span className="h-px flex-1 bg-border" />
                  </div>
                )}
                <div className="flex items-start gap-3">
                  <Field className="min-w-0 flex-1">
                    <FieldLabel className="text-xs">{label}</FieldLabel>
                    <FieldContent>
                      <Select
                        value={filters[kind] ?? []}
                        conditionNames={conditionNames}
                        onChange={(selected) => {
                          form.setValue("conditionNames", {
                            ...conditionNames,
                            ...Object.fromEntries(selected.map(({ id, name }) => [id, name]))
                          });
                          setFilter(
                            kind,
                            selected.map(({ id }) => id)
                          );
                        }}
                      />
                      <FieldError errors={[form.formState.errors[kind]]} />
                    </FieldContent>
                  </Field>
                  <IconButton
                    type="button"
                    size="xs"
                    variant="ghost"
                    className="mt-6.5 hover:text-danger"
                    aria-label={`Remove ${label} filter`}
                    onClick={() => setFilter(kind, undefined)}
                  >
                    <TrashIcon className="size-4" />
                  </IconButton>
                </div>
              </Fragment>
            );
          })}
        </div>
      ) : (
        <Empty className="mt-3 flex-none border py-8">
          <EmptyMedia variant="icon">
            <FilterIcon />
          </EmptyMedia>
          <EmptyDescription>{NO_FILTERS_DESCRIPTION} Add a filter to narrow it.</EmptyDescription>
        </Empty>
      )}

      {addableKinds.length > 0 && (
        <div className="mt-3">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button type="button" variant="outline" size="sm">
                <PlusIcon className="size-3.5" />
                Add Filter
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-64">
              {addableKinds.map((kind) => (
                <DropdownMenuItem key={kind} onClick={() => addFilter(kind)}>
                  <div className="flex flex-col">
                    <span>{CERTIFICATE_FILTER_DEFINITIONS[kind].label}</span>
                    <span className="text-xs text-muted">
                      {CERTIFICATE_FILTER_DEFINITIONS[kind].hint}
                    </span>
                  </div>
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      )}

      <div className="mt-8 flex items-start justify-between gap-4">
        <div>
          <p className="text-sm font-medium text-foreground">Matched Certificates</p>
          <p className="mt-0.5 text-xs text-muted">{previewSummary}</p>
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
        <PkiSyncMatchedCertificatesTable
          rows={preview?.certificates ?? []}
          isLoading={isPreviewing}
          emptyTitle={isPreviewFiltered ? "No certificates match" : "No active certificates"}
          emptyDescription={
            isPreviewFiltered
              ? "No active certificate matches these filters yet."
              : "There are no active certificates yet."
          }
        />
        {matchedCount > MATCHED_PAGE_SIZE && (
          <Pagination
            className="mt-2"
            count={matchedCount}
            page={page}
            perPage={MATCHED_PAGE_SIZE}
            onChangePage={setPage}
            onChangePerPage={() => {}}
            perPageList={[MATCHED_PAGE_SIZE]}
          />
        )}
      </div>
    </div>
  );
};
