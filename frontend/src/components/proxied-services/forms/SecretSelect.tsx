import { KeyIcon } from "lucide-react";

import { FilterableSelect } from "@app/components/v3";
import { useGetProjectSecrets } from "@app/hooks/api/secrets/queries";

type Props = {
  projectId: string;
  environment: string;
  secretPath: string;
  value?: string;
  onChange: (value: string) => void;
  isDisabled?: boolean;
  isError?: boolean;
  placeholder?: string;
};

type SecretOption = { label: string; value: string };

// Hoisted out of the component so it isn't recreated each render (react/no-unstable-nested-components).
const formatSecretOption = (option: SecretOption) => (
  <div className="flex items-center gap-2">
    <KeyIcon className="size-4 shrink-0 text-bunker-300" />
    <span className="truncate">{option.label}</span>
  </div>
);

// Picks a secret key from the current folder. Uses the searchable FilterableSelect so long secret
// lists stay usable. A stale reference (secret renamed/deleted) still renders its raw key.
export const SecretSelect = ({
  projectId,
  environment,
  secretPath,
  value,
  onChange,
  isDisabled,
  isError,
  placeholder = "Select a secret"
}: Props) => {
  const { data: secrets = [], isPending } = useGetProjectSecrets({
    projectId,
    environment,
    secretPath,
    viewSecretValue: false
  });

  const options: SecretOption[] = secrets.map((secret) => ({
    label: secret.key,
    value: secret.key
  }));
  const selected =
    options.find((option) => option.value === value) ?? (value ? { label: value, value } : null);

  return (
    <FilterableSelect
      isDisabled={isDisabled}
      isLoading={isPending && Boolean(projectId && environment)}
      isError={isError}
      value={selected}
      options={options}
      placeholder={placeholder}
      onChange={(newValue) => onChange((newValue as SecretOption | null)?.value ?? "")}
      getOptionLabel={(option) => option.label}
      getOptionValue={(option) => option.value}
      formatOptionLabel={formatSecretOption}
    />
  );
};
