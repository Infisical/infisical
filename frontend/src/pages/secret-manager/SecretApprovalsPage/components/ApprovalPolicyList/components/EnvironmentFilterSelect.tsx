import { useState } from "react";
import { CheckIcon, ChevronsUpDownIcon } from "lucide-react";

import {
  Button,
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
  Popover,
  PopoverContent,
  PopoverTrigger
} from "@app/components/v3";
import { cn } from "@app/components/v3/utils";
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
  const [isOpen, setIsOpen] = useState(false);
  const [inputValue, setInputValue] = useState("");

  const label =
    environments.find((env) => env.id === selectedEnvironmentIds[0])?.name ?? "All Environments";

  const handleSelectAll = () => onChange([]);

  const handleToggleEnv = (environmentId: string) => {
    onChange(selectedEnvironmentIds.includes(environmentId) ? [] : [environmentId]);
  };

  return (
    <Popover open={isOpen} onOpenChange={setIsOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={isOpen}
          className="w-[200px] shrink-0 justify-between"
        >
          <span className="truncate">{label}</span>
          <ChevronsUpDownIcon className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-[240px] p-0">
        <Command>
          <CommandInput
            value={inputValue}
            onValueChange={setInputValue}
            placeholder="Filter environments"
          />
          <CommandList>
            <CommandEmpty>No environment found.</CommandEmpty>
            {Boolean(environments.length) && !inputValue && (
              <>
                <CommandGroup>
                  <CommandItem forceMount keywords={[]} onSelect={handleSelectAll}>
                    <CheckIcon
                      className={cn(
                        "h-4 w-4",
                        selectedEnvironmentIds.length ? "opacity-0" : "opacity-100"
                      )}
                    />
                    All Environments
                  </CommandItem>
                </CommandGroup>
                <CommandSeparator />
              </>
            )}
            <CommandGroup>
              {environments.map((env) => (
                <CommandItem
                  key={env.id}
                  value={env.id}
                  onSelect={handleToggleEnv}
                  keywords={[env.name, env.slug]}
                >
                  <CheckIcon
                    className={cn(
                      "h-4 w-4 shrink-0",
                      selectedEnvironmentIds.includes(env.id) ? "opacity-100" : "opacity-0"
                    )}
                  />
                  <span className="truncate">{env.name}</span>
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
};
