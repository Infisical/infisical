import { useMemo, useState } from "react";
import { useFormContext, useWatch } from "react-hook-form";
import { Button } from "@infisical/cipher/ui/button";
import { Combobox, type ComboboxOption } from "@infisical/cipher/ui/combobox";
import { DataTable, type DataTableColumn } from "@infisical/cipher/ui/data-table";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger
} from "@infisical/cipher/ui/dropdown-menu";
import { EmptyState } from "@infisical/cipher/ui/empty";
import { Field } from "@infisical/cipher/ui/field";
import { Inline, Stack } from "@infisical/cipher/ui/layout";
import { Pagination } from "@infisical/cipher/ui/pagination";
import { Heading, SmallText } from "@infisical/cipher/ui/text";

import { MAX_CERTIFICATE_ALERT_FILTER_IDS } from "@app/hooks/api/alerts/types";
import { CertStatus } from "@app/hooks/api/certificates/enums";
import type { TCertificate } from "@app/hooks/api/certificates/types";
import { SignerStatus, signerStatusLabels } from "@app/hooks/api/signers/types";
import { getCertSourceLabel } from "@app/pages/cert-manager/CertificatesPage/components/CertificatesTable.utils";

import { useV4Adapter } from "../../data/adapters";
import { certificateName, ExpiryBadge, shortDate } from "../components/certificate";
import {
  CERTIFICATE_FILTER_KINDS,
  CertificateFilterKind,
  FILTER_DEFINITIONS,
  getFilterKinds,
  getFilterName,
  getNoFiltersDescription,
  isSignerEventType,
  pluralize,
  SOURCE_OPTIONS,
  type TAlertForm
} from "./alert-model";

const MATCHED_PAGE_SIZE = 20;

const useFilterOptions = (kind: CertificateFilterKind, projectId: string): ComboboxOption[] => {
  const certificates = useV4Adapter("certificates");
  const settings = useV4Adapter("certManagerSettings");
  const limit = MAX_CERTIFICATE_ALERT_FILTER_IDS;
  const applications = settings.useAlertApplications({ limit }).data;
  const profiles = certificates.useCertificateProfiles({ limit }).data;
  const signers = certificates.useSigners({ projectId, limit }).data;
  return useMemo(() => {
    switch (kind) {
      case CertificateFilterKind.Applications:
        return (applications?.applications ?? []).map(({ id, name }) => ({
          value: id,
          label: name
        }));
      case CertificateFilterKind.Profiles:
        return (profiles?.certificateProfiles ?? []).map(({ id, slug }) => ({
          value: id,
          label: slug
        }));
      case CertificateFilterKind.Signers:
        return (signers?.signers ?? []).map(({ id, name, status }) => ({
          value: id,
          label: name,
          meta: status !== SignerStatus.Active ? signerStatusLabels[status] : undefined
        }));
      default:
        return SOURCE_OPTIONS;
    }
  }, [kind, applications, profiles, signers]);
};

const FilterSelect = ({
  kind,
  projectId,
  value,
  conditionNames,
  error,
  onChange,
  onRemove
}: {
  kind: CertificateFilterKind;
  projectId: string;
  value: string[];
  conditionNames: Record<string, string>;
  error?: string;
  onChange: (selected: ComboboxOption[]) => void;
  onRemove: () => void;
}) => {
  const loaded = useFilterOptions(kind, projectId);
  const options = [
    ...loaded,
    ...value
      .filter((id) => !loaded.some((option) => option.value === id))
      .map((id) => ({ value: id, label: getFilterName(kind, id, conditionNames) }))
  ];
  const { label, noun } = FILTER_DEFINITIONS[kind];
  return (
    <Inline gap={8} align="end" wrap={false}>
      <div style={{ flex: 1, minWidth: 0 }}>
        <Field wide label={label} error={error}>
          <Combobox
            multiple
            clearable
            label={label}
            options={options}
            value={value}
            invalid={Boolean(error)}
            placeholder={`Select ${noun}s`}
            onChange={(ids) => onChange(options.filter((option) => ids.includes(option.value)))}
          />
        </Field>
      </div>
      <Button type="button" variant="ghost" size="icon-sm" icon="trash" iconOnly onClick={onRemove}>
        {`Remove ${label.toLowerCase()} filter`}
      </Button>
    </Inline>
  );
};

type TCertificateFilters = Pick<
  TAlertForm,
  | CertificateFilterKind.Applications
  | CertificateFilterKind.Profiles
  | CertificateFilterKind.Sources
>;

const previewColumns: DataTableColumn<TCertificate>[] = [
  {
    id: "name",
    header: "Certificate",
    primary: true,
    grow: true,
    render: (cert) => certificateName(cert)
  },
  { id: "source", header: "Source", render: (cert) => getCertSourceLabel(cert.source ?? null) },
  {
    id: "expires",
    header: "Expires",
    render: (cert) => (
      <Inline gap={8} align="center" wrap={false}>
        <span>{shortDate(cert.notAfter)}</span>
        <ExpiryBadge cert={cert} />
      </Inline>
    )
  }
];

const MatchedCertificatesPreview = ({
  filters,
  projectId
}: {
  filters: TCertificateFilters;
  projectId: string;
}) => {
  const previewFilters = {
    applicationIds: filters.applicationIds?.length ? filters.applicationIds : undefined,
    profileIds: filters.profileIds?.length ? filters.profileIds : undefined,
    sources: filters.sources?.length ? filters.sources : undefined
  };
  const previewKey = JSON.stringify(previewFilters);
  const [paging, setPaging] = useState({ key: previewKey, page: 1 });
  const page = paging.key === previewKey ? paging.page : 1;
  const preview = useV4Adapter("certificates").useCertificates({
    projectId,
    offset: (page - 1) * MATCHED_PAGE_SIZE,
    limit: MATCHED_PAGE_SIZE,
    status: CertStatus.ACTIVE,
    applicationIds: previewFilters.applicationIds,
    profileIds: previewFilters.profileIds,
    source: previewFilters.sources
  });
  const matchedCount = preview.data?.totalCount ?? 0;
  const isFiltered = CERTIFICATE_FILTER_KINDS.some((kind) => previewFilters[kind] !== undefined);
  const hasUnfinishedFilter = CERTIFICATE_FILTER_KINDS.some((kind) => filters[kind]?.length === 0);
  const certificatesLabel = pluralize(matchedCount, "active certificate");

  let summary = "Loading the certificates this alert covers.";
  if (preview.error) summary = "The matched certificates couldn't be loaded.";
  else if (hasUnfinishedFilter)
    summary = "Select at least one value in each filter, or remove it, to update the preview.";
  else if (preview.data)
    summary = isFiltered
      ? `${certificatesLabel} ${matchedCount === 1 ? "matches" : "match"} these filters.`
      : `This alert covers ${matchedCount > 1 ? "all " : ""}${certificatesLabel}.`;

  const showRows = !preview.error && !hasUnfinishedFilter;
  let empty = isFiltered
    ? {
        title: "No certificates match",
        description: "No active certificate matches these filters yet."
      }
    : { title: "No active certificates", description: "There are no active certificates yet." };
  if (hasUnfinishedFilter)
    empty = {
      title: "Finish the filter",
      description: "Select at least one value in each filter, or remove it."
    };

  return (
    <Stack gap={12}>
      <Stack gap={4}>
        <Heading level={4} size="subsection">
          Matched certificates
        </Heading>
        <SmallText muted>{summary}</SmallText>
      </Stack>
      {preview.error ? (
        <EmptyState
          size="sm"
          icon="alert"
          title="Certificates couldn't be loaded"
          description="Reload the page to try again."
        />
      ) : (
        <DataTable
          label="Matched certificates"
          rows={showRows ? (preview.data?.certificates ?? []) : []}
          columns={previewColumns}
          getRowId={(cert) => cert.id}
          rowLabel={certificateName}
          loading={showRows && preview.isPending}
          loadingRows={3}
          empty={
            <EmptyState size="sm" icon="cert" title={empty.title} description={empty.description} />
          }
          pagination={
            showRows && matchedCount > MATCHED_PAGE_SIZE ? (
              <Pagination
                variant="compact"
                page={page}
                total={matchedCount}
                pageSize={MATCHED_PAGE_SIZE}
                onPageChange={(next) => setPaging({ key: previewKey, page: next })}
              />
            ) : undefined
          }
        />
      )}
    </Stack>
  );
};

export const FiltersStep = ({ projectId }: { projectId: string }) => {
  const { control, setValue, formState } = useFormContext<TAlertForm>();
  const [eventType, applicationIds, profileIds, sources, signerIds, conditionNames] = useWatch({
    control,
    name: ["eventType", "applicationIds", "profileIds", "sources", "signerIds", "conditionNames"]
  });
  const filters = { applicationIds, profileIds, sources, signerIds };
  const isSignerEvent = isSignerEventType(eventType);
  const filterKinds = getFilterKinds(eventType);
  const presentKinds = filterKinds.filter((kind) => filters[kind] !== undefined);
  const addableKinds = filterKinds.filter((kind) => filters[kind] === undefined);

  const setFilter = (kind: CertificateFilterKind, ids: string[] | undefined) =>
    setValue(kind, ids as TAlertForm[typeof kind], { shouldDirty: true, shouldValidate: true });

  return (
    <Stack gap={24}>
      <Stack gap={12}>
        <SmallText muted>
          {isSignerEvent
            ? "The alert covers only the signers selected below."
            : "A certificate is covered only when it matches every filter below."}
        </SmallText>
        {presentKinds.length > 0 ? (
          presentKinds.map((kind) => (
            <FilterSelect
              key={kind}
              kind={kind}
              projectId={projectId}
              value={filters[kind] ?? []}
              conditionNames={conditionNames}
              error={formState.errors[kind]?.message}
              onRemove={() => setFilter(kind, undefined)}
              onChange={(selected) => {
                if (kind !== CertificateFilterKind.Sources) {
                  setValue("conditionNames", {
                    ...conditionNames,
                    ...Object.fromEntries(selected.map(({ value, label }) => [value, label]))
                  });
                }
                setFilter(
                  kind,
                  selected.map(({ value }) => value)
                );
              }}
            />
          ))
        ) : (
          <EmptyState
            size="sm"
            icon="search"
            title="No filters"
            description={`${getNoFiltersDescription(eventType)} Add a filter to narrow it.`}
          />
        )}
        {addableKinds.length > 0 && (
          <div>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button type="button" variant="outline" size="sm" icon="plus" layout="trigger">
                  Add filter
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start">
                {addableKinds.map((kind) => (
                  <DropdownMenuItem
                    key={kind}
                    description={FILTER_DEFINITIONS[kind].hint}
                    onSelect={() => setValue(kind, [], { shouldDirty: true })}
                  >
                    {FILTER_DEFINITIONS[kind].label}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        )}
      </Stack>
      {!isSignerEvent && <MatchedCertificatesPreview filters={filters} projectId={projectId} />}
    </Stack>
  );
};
