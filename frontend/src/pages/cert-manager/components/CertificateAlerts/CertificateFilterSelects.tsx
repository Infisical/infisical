import { ReactNode, useMemo, useState } from "react";

import { Badge, Combobox } from "@app/components/v3";
import { useProject } from "@app/context";
import { useDebounce } from "@app/hooks";
import { MAX_CERTIFICATE_ALERT_FILTER_IDS } from "@app/hooks/api/alerts";
import { useListCertificateProfiles } from "@app/hooks/api/certificateProfiles";
import { CertSource } from "@app/hooks/api/certificates/enums";
import { useListPkiApplications } from "@app/hooks/api/pkiApplications";
import {
  getSignerStatusBadgeVariant,
  SignerStatus,
  signerStatusLabels,
  useListSigners
} from "@app/hooks/api/signers";

import { CertificateFilterKind, getFilterName } from "./types";

type TFilterOption = { id: string; name: string; status?: SignerStatus };

type Props = {
  value: string[];
  conditionNames: Record<string, string>;
  onChange: (selected: TFilterOption[]) => void;
};

const FilterCombobox = ({
  kind,
  value,
  conditionNames,
  onChange,
  options,
  isLoading,
  onSearchChange,
  placeholder,
  renderOption
}: Props & {
  kind: CertificateFilterKind;
  options: TFilterOption[];
  isLoading: boolean;
  onSearchChange?: (search: string) => void;
  placeholder: string;
  renderOption?: (option: TFilterOption) => ReactNode;
}) => {
  const optionsById = useMemo(
    () => new Map(options.map((option) => [option.id, option])),
    [options]
  );

  return (
    <Combobox
      multiple
      isClearable
      options={options}
      value={value.map(
        (id) => optionsById.get(id) ?? { id, name: getFilterName(kind, id, conditionNames) }
      )}
      onValueChange={(selected) => onChange([...selected])}
      getOptionValue={(option) => option.id}
      getOptionLabel={(option) => option.name}
      onSearchChange={onSearchChange}
      renderOption={renderOption}
      isLoading={isLoading}
      placeholder={placeholder}
    />
  );
};

export const ApplicationFilterSelect = (props: Props) => {
  const [search, setSearch] = useState("");
  const [debouncedSearch] = useDebounce(search);
  const { data, isPending } = useListPkiApplications({
    limit: MAX_CERTIFICATE_ALERT_FILTER_IDS,
    ...(debouncedSearch ? { search: debouncedSearch } : {})
  });
  const options = useMemo(
    () => (data?.applications ?? []).map(({ id, name }) => ({ id, name })),
    [data]
  );

  return (
    <FilterCombobox
      {...props}
      kind={CertificateFilterKind.Applications}
      options={options}
      isLoading={isPending}
      onSearchChange={setSearch}
      placeholder="Select applications"
    />
  );
};

export const ProfileFilterSelect = (props: Props) => {
  const [search, setSearch] = useState("");
  const [debouncedSearch] = useDebounce(search);
  const { data, isPending } = useListCertificateProfiles({
    limit: MAX_CERTIFICATE_ALERT_FILTER_IDS,
    ...(debouncedSearch ? { search: debouncedSearch } : {})
  });
  const options = useMemo(
    () => (data?.certificateProfiles ?? []).map(({ id, slug }) => ({ id, name: slug })),
    [data]
  );

  return (
    <FilterCombobox
      {...props}
      kind={CertificateFilterKind.Profiles}
      options={options}
      isLoading={isPending}
      onSearchChange={setSearch}
      placeholder="Select profiles"
    />
  );
};

export const SignerFilterSelect = (props: Props) => {
  const { projectId } = useProject();
  const [search, setSearch] = useState("");
  const [debouncedSearch] = useDebounce(search);
  const { data, isPending } = useListSigners({
    projectId,
    limit: MAX_CERTIFICATE_ALERT_FILTER_IDS,
    ...(debouncedSearch ? { search: debouncedSearch } : {})
  });
  const options = useMemo(
    () => (data?.signers ?? []).map(({ id, name, status }) => ({ id, name, status })),
    [data]
  );

  return (
    <FilterCombobox
      {...props}
      kind={CertificateFilterKind.Signers}
      options={options}
      isLoading={isPending}
      onSearchChange={setSearch}
      placeholder="Select signers"
      renderOption={({ name, status }) => (
        <span className="flex min-w-0 items-center gap-2">
          <span className="truncate">{name}</span>
          {status && status !== SignerStatus.Active && (
            <Badge variant={getSignerStatusBadgeVariant(status)}>
              {signerStatusLabels[status] ?? status}
            </Badge>
          )}
        </span>
      )}
    />
  );
};

const SOURCE_OPTIONS = Object.values(CertSource).map((source) => ({
  id: source,
  name: getFilterName(CertificateFilterKind.Sources, source, {})
}));

export const SourceFilterSelect = (props: Props) => (
  <FilterCombobox
    {...props}
    kind={CertificateFilterKind.Sources}
    options={SOURCE_OPTIONS}
    isLoading={false}
    placeholder="Select sources"
  />
);
