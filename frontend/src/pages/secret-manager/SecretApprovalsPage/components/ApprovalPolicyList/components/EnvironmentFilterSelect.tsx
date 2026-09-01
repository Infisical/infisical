import { Combobox } from "@app/components/v3";
import { ProjectEnv } from "@app/hooks/api/types";

type Props = {
  environments: ProjectEnv[];
  selectedEnvironmentIds: string[];
  onChange: (environmentIds: string[]) => void;
};

export const EnvironmentFilterSelect = ({
  environments,
  selectedEnvironmentIds,
  onChange
}: Props) => {
  const selectedEnvironment =
    environments.find((environment) => environment.id === selectedEnvironmentIds[0]) ?? null;

  return (
    <div className="w-42 shrink-0">
      <Combobox
        aria-label="Filter environments"
        className="w-full"
        options={environments}
        value={selectedEnvironment}
        onValueChange={(environment) => onChange([environment.id])}
        onClear={() => onChange([])}
        getOptionValue={(environment) => environment.id}
        getOptionLabel={(environment) => environment.name}
        getOptionKeywords={(environment) => [environment.slug]}
        clearAriaLabel="Clear environment filter"
        searchPlaceholder="Filter environments"
        searchAriaLabel="Filter environments"
        emptyMessage="No environments found."
        placeholder="All Environments"
      />
    </div>
  );
};
