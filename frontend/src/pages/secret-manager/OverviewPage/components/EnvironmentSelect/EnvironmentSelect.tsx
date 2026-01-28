import { SetStateAction, useState } from "react";
import { CheckIcon, ChevronsUpDownIcon } from "lucide-react";

import {
  Button,
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  Popover,
  PopoverContent,
  PopoverTrigger
} from "@app/components/v3";
import { cn } from "@app/components/v3/utils";
import { useProject } from "@app/context";
import { ProjectEnv } from "@app/hooks/api/types";

type Props = {
  selectedEnvs: ProjectEnv[];
  setSelectedEnvs: (value: SetStateAction<ProjectEnv[]>) => void;
};

export function EnvironmentSelect({ selectedEnvs, setSelectedEnvs }: Props) {
  const [isOpen, setIsOpen] = useState(false);

  const {
    currentProject: { environments: projectEnvs }
  } = useProject();

  let label: string;

  if (selectedEnvs.length === 1) {
    label = selectedEnvs[0].name;
  } else if (selectedEnvs.length > 0 && selectedEnvs.length < projectEnvs.length) {
    label = `${selectedEnvs.length} Environments`;
  } else {
    label = "All Environments";
  }

  const handleSelectAll = () => setSelectedEnvs([]);

  const handleSelectEnv = (envId: string) => {
    setSelectedEnvs((prev) => {
      if (prev.map((env) => env.id).includes(envId)) {
        return prev.filter((env) => env.id !== envId);
      }

      const selectedEnv = projectEnvs.find((env) => env.id === envId);

      if (selectedEnv) return [...prev, selectedEnv];

      return prev;
    });
  };

  return (
    <>
      {/* TODO: update env modal UI and figure out what's breaking with add */}
      {/* <AddEnvironmentModal onOpenChange={setIsModalOpen} isOpen={isModalOpen} /> */}
      <Popover open={isOpen} onOpenChange={setIsOpen}>
        <PopoverTrigger asChild>
          <Button
            variant="outline"
            role="combobox"
            aria-expanded={isOpen}
            className="w-[200px] justify-between"
          >
            <span className="truncate">{label}</span>
            <ChevronsUpDownIcon className="ml-2 h-4 w-4 shrink-0 opacity-50" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-[200px] p-0">
          <Command>
            <CommandInput placeholder="Filter environments..." />
            <CommandList>
              <CommandEmpty>No environment found.</CommandEmpty>
              <CommandGroup>
                {Boolean(projectEnvs.length) && (
                  <CommandItem onSelect={handleSelectAll}>
                    <CheckIcon
                      className={cn(
                        "mr-2 h-4 w-4",
                        !selectedEnvs.length ? "opacity-100" : "opacity-0"
                      )}
                    />
                    All Environments
                  </CommandItem>
                )}
                {projectEnvs.map((env) => (
                  <CommandItem
                    key={env.id}
                    value={env.id}
                    onSelect={handleSelectEnv}
                    keywords={[env.name, env.slug]}
                  >
                    <CheckIcon
                      className={cn(
                        "mr-2 h-4 w-4",
                        selectedEnvs.map((e) => e.id).includes(env.id) ? "opacity-100" : "opacity-0"
                      )}
                    />
                    {env.name}
                  </CommandItem>
                ))}
              </CommandGroup>
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>
    </>
  );
}
