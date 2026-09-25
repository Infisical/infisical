import { useMemo } from "react";
import { CheckIcon, FolderIcon } from "lucide-react";

import { Combobox, InputGroup, InputGroupAddon } from "@app/components/v3";
import { useListProjectEnvironmentsFolders } from "@app/hooks/api/secretFolders/queries";

type Props = {
  projectId: string;
  environment?: string;
  value: string;
  onChange: (path: string) => void;
};

export const QuickSearchFolderPicker = ({ projectId, environment, value, onChange }: Props) => {
  const { data, isPending, isError } = useListProjectEnvironmentsFolders(projectId, {
    enabled: Boolean(environment)
  });
  const options = useMemo(
    () =>
      [...new Set((data?.[environment ?? ""]?.folders ?? []).map(({ path }) => path))]
        .filter((path) => path !== "/")
        .sort((left, right) => left.localeCompare(right)),
    [data, environment]
  );

  return (
    <InputGroup data-disabled={!environment || undefined}>
      <InputGroupAddon align="inline-start" className="pr-0 [&>svg]:text-folder">
        <FolderIcon aria-hidden="true" />
      </InputGroupAddon>
      <Combobox
        id="quick-search-folder-path"
        variant="input-group"
        modal
        options={options}
        value={value === "/" ? null : value}
        onValueChange={(path) => onChange(path ?? "/")}
        onClear={() => onChange("/")}
        isDisabled={!environment}
        isLoading={Boolean(environment && isPending)}
        placeholder="All folders"
        searchPlaceholder="Search folders..."
        searchAriaLabel="Search folders"
        clearAriaLabel="Search all folders"
        emptyMessage={isError ? "Could not load folders." : "No folders found."}
        loadingMessage="Loading folders..."
        getOptionValue={(path) => path}
        getOptionLabel={(path) => path}
        renderOption={(path) => <span className="truncate font-mono text-xs">{path}</span>}
        renderOptionIndicator={(_, { isSelected }) =>
          isSelected ? <CheckIcon className="size-4" /> : null
        }
        aria-describedby="quick-search-folder-help"
      />
    </InputGroup>
  );
};
