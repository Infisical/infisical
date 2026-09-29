import { UseFormReturn, useWatch } from "react-hook-form";
import { FilterIcon } from "lucide-react";

import {
  AddCertificateFilterMenu,
  CertificateFilterList,
  MatchedCertificatesPreview,
  TCertificateFilterItem,
  useCertificateFilterPreview
} from "@app/components/certificate-filters";
import { Empty, EmptyDescription, EmptyMedia, FieldError } from "@app/components/v3";
import { useListWorkspaceCertificates } from "@app/hooks/api";
import { CertStatus } from "@app/hooks/api/certificates/enums";

import { hasUnfinishedFilter, TCertificateAlertForm } from "./certificate-alert-schema";
import { ApplicationFilterSelect, ProfileFilterSelect } from "./CertificateFilterSelects";
import {
  CERTIFICATE_FILTER_DEFINITIONS,
  NO_FILTERS_DESCRIPTION,
  TCertificateFilterKind
} from "./types";

const MATCHED_PAGE_SIZE = 20;

const FILTER_KINDS = Object.keys(CERTIFICATE_FILTER_DEFINITIONS) as TCertificateFilterKind[];

type Props = { form: UseFormReturn<TCertificateAlertForm>; projectId: string };

export const FiltersStep = ({ form, projectId }: Props) => {
  const applicationIds = useWatch({ control: form.control, name: "applicationIds" });
  const profileIds = useWatch({ control: form.control, name: "profileIds" });
  const filters = { applicationIds, profileIds };

  const { previewFilters, page, setPage, isStale, reloadPreview } =
    useCertificateFilterPreview(filters);
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

  const setFilter = (kind: TCertificateFilterKind, ids: string[] | undefined) =>
    form.setValue(kind, ids, { shouldDirty: true, shouldValidate: true });
  const addFilter = (kind: TCertificateFilterKind) =>
    form.setValue(kind, [], { shouldDirty: true });

  const presentKinds = FILTER_KINDS.filter((kind) => filters[kind] !== undefined);
  const items: TCertificateFilterItem[] = presentKinds.map((kind) => {
    const Select = kind === "applicationIds" ? ApplicationFilterSelect : ProfileFilterSelect;
    return {
      key: kind,
      label: CERTIFICATE_FILTER_DEFINITIONS[kind].label,
      onRemove: () => setFilter(kind, undefined),
      body: (
        <>
          <Select value={filters[kind] ?? []} onChange={(ids) => setFilter(kind, ids)} />
          <FieldError errors={[form.formState.errors[kind]]} />
        </>
      )
    };
  });

  const matchedCount = preview?.totalCount ?? 0;
  const hasFilters = presentKinds.length > 0;
  const isPreviewFiltered = FILTER_KINDS.some((kind) => previewFilters[kind] !== undefined);
  const certificatesLabel = `${matchedCount} active certificate${matchedCount === 1 ? "" : "s"}`;
  let previewSummary = "Loading the certificates this alert covers.";
  if (preview && !isPreviewing) {
    previewSummary = isPreviewFiltered
      ? `${certificatesLabel} ${matchedCount === 1 ? "matches" : "match"} these filters.`
      : `${certificatesLabel} in Certificate Manager.`;
  }

  return (
    <div className="flex flex-col">
      <div>
        <p className="text-sm font-medium text-foreground">Filters</p>
        <p className="mt-0.5 text-xs text-muted">
          A certificate is covered only when it matches every filter below.
        </p>
      </div>

      {hasFilters ? (
        <CertificateFilterList className="mt-3" items={items} />
      ) : (
        <Empty className="mt-3 flex-none border py-8">
          <EmptyMedia variant="icon">
            <FilterIcon />
          </EmptyMedia>
          <EmptyDescription>{NO_FILTERS_DESCRIPTION} Add a filter to narrow it.</EmptyDescription>
        </Empty>
      )}

      <div className="mt-3">
        <AddCertificateFilterMenu
          options={FILTER_KINDS.filter((kind) => filters[kind] === undefined).map((kind) => ({
            kind,
            label: CERTIFICATE_FILTER_DEFINITIONS[kind].label,
            hint: CERTIFICATE_FILTER_DEFINITIONS[kind].hint
          }))}
          onAdd={addFilter}
        />
      </div>

      <div className="mt-8">
        <MatchedCertificatesPreview
          summary={previewSummary}
          rows={(preview?.certificates ?? []).map((certificate) => ({
            id: certificate.id,
            commonName: certificate.commonName,
            altNames: certificate.altNames,
            serialNumber: certificate.serialNumber,
            notAfter: certificate.notAfter,
            profileName: certificate.profileName
          }))}
          totalCount={matchedCount}
          isLoading={isPreviewing}
          isStale={isStale}
          isUnfinished={isUnfinished}
          onReload={() => reloadPreview(refetchPreview)}
          page={page}
          pageSize={MATCHED_PAGE_SIZE}
          onPageChange={setPage}
          emptyTitle={isPreviewFiltered ? "No certificates match" : "No active certificates"}
          emptyDescription={
            isPreviewFiltered
              ? "No active certificate matches these filters yet."
              : "There are no active certificates yet."
          }
        />
      </div>
    </div>
  );
};
