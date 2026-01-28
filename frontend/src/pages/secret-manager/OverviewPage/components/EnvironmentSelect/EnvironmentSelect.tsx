import { SetStateAction, useEffect, useRef, useState } from "react";
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
  PopoverTrigger,
  Tooltip,
  TooltipContent,
  TooltipTrigger
} from "@app/components/v3";
import { cn } from "@app/components/v3/utils";
import { useProject } from "@app/context";
import { ProjectEnv } from "@app/hooks/api/types";

const TruncatedText = ({ text }: { text: string }) => {
  const [isOverflowing, setIsOverflowing] = useState(false);
  const ref = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (el) {
      setIsOverflowing(el.scrollWidth > el.clientWidth);
    }
  }, [text]);

  if (!isOverflowing) {
    return (
      <span ref={ref} className="truncate">
        {text}
      </span>
    );
  }

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span ref={ref} className="truncate">
          {text}
        </span>
      </TooltipTrigger>
      <TooltipContent side="right">{text}</TooltipContent>
    </Tooltip>
  );
};

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

  const [inputValue, setInputValue] = useState("");

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
        <PopoverContent align="start" className="w-[200px] p-0">
          <Command>
            <CommandInput
              value={inputValue}
              onValueChange={setInputValue}
              placeholder="Filter environments..."
            />
            <CommandList>
              <CommandEmpty>No environment found.</CommandEmpty>
              <CommandGroup>
                {Boolean(projectEnvs.length) && !inputValue && (
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
                        "mr-2 h-4 w-4 shrink-0",
                        selectedEnvs.map((e) => e.id).includes(env.id) ? "opacity-100" : "opacity-0"
                      )}
                    />
                    <TruncatedText text={env.name} />
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
