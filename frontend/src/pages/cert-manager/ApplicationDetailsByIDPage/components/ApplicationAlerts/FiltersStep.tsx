import { Fragment, useEffect, useState } from "react";
import { UseFormReturn, useWatch } from "react-hook-form";
import { FilterIcon, PlusIcon, TrashIcon } from "lucide-react";

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
  Pagination
} from "@app/components/v3";
import { useListWorkspaceCertificates } from "@app/hooks/api";
import { CertStatus } from "@app/hooks/api/certificates/enums";

import { ApplicationFilterSelect, ProfileFilterSelect } from "./CertificateFilterSelects";
import {
  CERTIFICATE_FILTER_DEFINITIONS,
  CertificateFilterKind,
  NO_FILTERS_DESCRIPTION,
  TCertificateAlertForm
} from "./types";

const MATCHED_PAGE_SIZE = 20;

const FILTER_KINDS = Object.values(CertificateFilterKind);

type Props = { form: UseFormReturn<TCertificateAlertForm>; projectId: string };

export const FiltersStep = ({ form, projectId }: Props) => {
  const applicationIds = useWatch({
    control: form.control,
    name: CertificateFilterKind.Applications
  });
  const profileIds = useWatch({ control: form.control, name: CertificateFilterKind.Profiles });
  const conditionNames = useWatch({ control: form.control, name: "conditionNames" });
  const filters = { applicationIds, profileIds };

  const previewFilters = {
    applicationIds: applicationIds?.length ? applicationIds : undefined,
    profileIds: profileIds?.length ? profileIds : undefined
  };
  const previewKey = JSON.stringify(previewFilters);
  const [page, setPage] = useState(1);

  useEffect(() => {
    setPage(1);
  }, [previewKey]);

  const {
    data: preview,
    isFetching: isPreviewing,
    isError: isPreviewError,
    refetch: retryPreview
  } = useListWorkspaceCertificates({
    projectId,
    offset: (page - 1) * MATCHED_PAGE_SIZE,
    limit: MATCHED_PAGE_SIZE,
    status: CertStatus.ACTIVE,
    applicationIds: previewFilters.applicationIds,
    profileIds: previewFilters.profileIds
  });

  const setFilter = (kind: CertificateFilterKind, ids: string[] | undefined) =>
    form.setValue(kind, ids, { shouldDirty: true, shouldValidate: true });
  const addFilter = (kind: CertificateFilterKind) => form.setValue(kind, [], { shouldDirty: true });

  const presentKinds = FILTER_KINDS.filter((kind) => filters[kind] !== undefined);
  const addableKinds = FILTER_KINDS.filter((kind) => filters[kind] === undefined);

  const matchedCount = preview?.totalCount ?? 0;
  const isPreviewFiltered = FILTER_KINDS.some((kind) => previewFilters[kind] !== undefined);
  const hasUnfinishedFilter = FILTER_KINDS.some((kind) => filters[kind]?.length === 0);
  const certificatesLabel = `${matchedCount} active certificate${matchedCount === 1 ? "" : "s"}`;
  let previewSummary = "Loading the certificates this alert covers.";
  if (isPreviewError && !isPreviewing) {
    previewSummary = "The matched certificates couldn't be loaded.";
  } else if (hasUnfinishedFilter) {
    previewSummary =
      "Select at least one value in each filter, or remove it, to update the preview.";
  } else if (preview && !isPreviewing) {
    previewSummary = isPreviewFiltered
      ? `${certificatesLabel} ${matchedCount === 1 ? "matches" : "match"} these filters.`
      : `This alert covers ${matchedCount > 1 ? "all " : ""}${certificatesLabel}.`;
  }

  let previewEmptyState = isPreviewFiltered
    ? {
        title: "No certificates match",
        description: "No active certificate matches these filters yet."
      }
    : { title: "No active certificates", description: "There are no active certificates yet." };
  if (isPreviewError) {
    previewEmptyState = {
      title: "Certificates couldn't be loaded",
      description: "Select Retry to try again."
    };
  } else if (hasUnfinishedFilter) {
    previewEmptyState = {
      title: "Finish the filter",
      description: "Select at least one value in each filter, or remove it."
    };
  }
  const showPreviewRows = !isPreviewError && !hasUnfinishedFilter;

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
              kind === CertificateFilterKind.Applications
                ? ApplicationFilterSelect
                : ProfileFilterSelect;
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
                    className="mt-6.5"
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

      <div className="mt-8 flex items-end justify-between gap-3">
        <div>
          <p className="text-sm font-medium text-foreground">Matched Certificates</p>
          <p className="mt-0.5 text-xs text-muted">{previewSummary}</p>
        </div>
        {isPreviewError && (
          <Button
            type="button"
            variant="outline"
            size="xs"
            isPending={isPreviewing}
            isDisabled={isPreviewing}
            onClick={() => retryPreview()}
          >
            Retry
          </Button>
        )}
      </div>

      <div className="mt-3">
        <PkiSyncMatchedCertificatesTable
          rows={showPreviewRows ? (preview?.certificates ?? []) : []}
          isLoading={showPreviewRows && !preview}
          emptyTitle={previewEmptyState.title}
          emptyDescription={previewEmptyState.description}
        />
        {showPreviewRows && matchedCount > MATCHED_PAGE_SIZE && (
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
