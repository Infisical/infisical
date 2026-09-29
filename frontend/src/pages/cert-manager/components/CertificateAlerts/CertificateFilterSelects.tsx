import { useMemo, useState } from "react";

import { Combobox } from "@app/components/v3";
import { useDebounce } from "@app/hooks";
import { MAX_CERTIFICATE_ALERT_FILTER_IDS } from "@app/hooks/api/alerts";
import { useListCertificateProfiles } from "@app/hooks/api/certificateProfiles";
import { useListPkiApplications } from "@app/hooks/api/pkiApplications";

import { useCertificateFilterNames } from "./useCertificateFilterNames";

type TFilterOption = { id: string; name: string };

type Props = {
  value: string[];
  onChange: (ids: string[]) => void;
};

const FilterCombobox = ({
  value,
  onChange,
  options,
  isLoading,
  resolveName,
  onSearchChange,
  placeholder
}: Props & {
  options: TFilterOption[];
  isLoading: boolean;
  resolveName: (id: string) => string;
  onSearchChange: (search: string) => void;
  placeholder: string;
}) => {
  const optionNames = useMemo(
    () => new Map(options.map((option) => [option.id, option.name])),
    [options]
  );

  return (
    <Combobox
      multiple
      isClearable
      options={options}
      value={value.map((id) => ({ id, name: optionNames.get(id) ?? resolveName(id) }))}
      onValueChange={(selected) => onChange(selected.map((option) => option.id))}
      getOptionValue={(option) => option.id}
      getOptionLabel={(option) => option.name}
      onSearchChange={onSearchChange}
      isLoading={isLoading}
      placeholder={placeholder}
    />
  );
};

export const ApplicationFilterSelect = ({ value, onChange }: Props) => {
  const [search, setSearch] = useState("");
  const [debouncedSearch] = useDebounce(search);
  const { getApplicationName } = useCertificateFilterNames({
    applicationIds: value,
    profileIds: []
  });
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
      value={value}
      onChange={onChange}
      options={options}
      isLoading={isPending}
      resolveName={getApplicationName}
      onSearchChange={setSearch}
      placeholder="Select applications"
    />
  );
};

export const ProfileFilterSelect = ({ value, onChange }: Props) => {
  const [search, setSearch] = useState("");
  const [debouncedSearch] = useDebounce(search);
  const { getProfileName } = useCertificateFilterNames({ applicationIds: [], profileIds: value });
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
      value={value}
      onChange={onChange}
      options={options}
      isLoading={isPending}
      resolveName={getProfileName}
      onSearchChange={setSearch}
      placeholder="Select profiles"
    />
  );
};
