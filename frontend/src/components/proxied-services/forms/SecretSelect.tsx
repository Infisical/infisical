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
    />
  );
};
