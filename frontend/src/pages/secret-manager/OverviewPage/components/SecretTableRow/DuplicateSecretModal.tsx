import { useEffect, useState } from "react";
import { CheckIcon, ChevronsUpDownIcon, CopyIcon, KeyIcon } from "lucide-react";

import {
  Badge,
  Button,
  Checkbox,
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Popover,
  PopoverContent,
  PopoverTrigger
} from "@app/components/v3";
import { cn } from "@app/components/v3/utils";
import { useProject } from "@app/context";

type IncludeKey = "value" | "comment" | "tags" | "metadata" | "skipMultilineEncoding";

const INCLUDE_OPTIONS: { key: IncludeKey; label: string; description: string }[] = [
  { key: "value", label: "Secret value", description: "Copy the encrypted value" },
  { key: "comment", label: "Comment", description: "Inline note attached to the secret" },
  { key: "tags", label: "Tags", description: "All tags currently assigned" },
  { key: "metadata", label: "Metadata", description: "Custom key/value metadata" },
  {
    key: "skipMultilineEncoding",
    label: "Multi-line encoding",
    description: "Preserve the multi-line encoding setting"
  }
];

const DEFAULT_INCLUDE: Record<IncludeKey, boolean> = {
  value: true,
  comment: true,
  tags: true,
  metadata: true,
  skipMultilineEncoding: true
};

type Props = {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  secretName: string;
  secretPath: string;
  sourceEnvironment: { slug: string; name: string };
};

export const DuplicateSecretModal = ({
  isOpen,
  onOpenChange,
  secretName,
  secretPath,
  sourceEnvironment
}: Props) => {
  const {
    currentProject: { environments }
  } = useProject();

  const [selectedEnvIds, setSelectedEnvIds] = useState<string[]>([]);
  const [includeOptions, setIncludeOptions] =
    useState<Record<IncludeKey, boolean>>(DEFAULT_INCLUDE);
  const [popoverOpen, setPopoverOpen] = useState(false);
  const [searchValue, setSearchValue] = useState("");

  useEffect(() => {
    if (!isOpen) {
      setSelectedEnvIds([]);
      setIncludeOptions(DEFAULT_INCLUDE);
      setSearchValue("");
      setPopoverOpen(false);
    }
  }, [isOpen]);

  const availableEnvs = environments.filter((env) => env.slug !== sourceEnvironment.slug);

  const toggleEnv = (envId: string) => {
    setSelectedEnvIds((prev) =>
      prev.includes(envId) ? prev.filter((id) => id !== envId) : [...prev, envId]
    );
  };

  const toggleInclude = (key: IncludeKey) => {
    setIncludeOptions((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  let triggerLabel: string;
  if (selectedEnvIds.length === 0) {
    triggerLabel = "Search environments...";
  } else if (selectedEnvIds.length === 1) {
    const env = availableEnvs.find((e) => e.id === selectedEnvIds[0]);
    triggerLabel = env?.name ?? "1 environment";
  } else {
    triggerLabel = `${selectedEnvIds.length} environments`;
  }

  let actionLabel: string;
  if (selectedEnvIds.length === 0) {
    actionLabel = "Duplicate to ...";
  } else if (selectedEnvIds.length === 1) {
    const env = availableEnvs.find((e) => e.id === selectedEnvIds[0]);
    actionLabel = `Duplicate to ${env?.name ?? "environment"}`;
  } else {
    actionLabel = `Duplicate to ${selectedEnvIds.length} environments`;
  }

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <div className="flex items-center gap-2">
            <span className="flex size-7 items-center justify-center rounded-md border border-project/25 bg-project/10 text-project">
              <CopyIcon className="size-3.5" />
            </span>
            <DialogTitle>Duplicate Secret</DialogTitle>
          </div>
          <DialogDescription>
            Copy this secret and its metadata into one or more environments.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-1.5">
          <p className="text-muted-foreground text-xs font-medium tracking-wide uppercase">
            Source
          </p>
          <div className="flex items-center justify-between rounded-md border border-border bg-container px-3 py-2">
            <div className="flex min-w-0 items-center gap-2 text-sm text-foreground">
              <KeyIcon className="text-muted-foreground size-3.5 shrink-0" />
              {secretPath !== "/" && (
                <span className="text-muted-foreground/60 truncate">{secretPath}</span>
              )}
              <span className="truncate">{secretName}</span>
            </div>
            <Badge variant="info">{sourceEnvironment.name}</Badge>
          </div>
        </div>

        <div className="flex flex-col gap-1.5">
          <p className="text-muted-foreground text-xs font-medium tracking-wide uppercase">
            Target environments
          </p>
          <Popover open={popoverOpen} onOpenChange={setPopoverOpen}>
            <PopoverTrigger asChild>
              <Button
                variant="outline"
                role="combobox"
                aria-expanded={popoverOpen}
                isFullWidth
                className="justify-between font-normal"
              >
                <span
                  className={cn("truncate", selectedEnvIds.length === 0 && "text-muted-foreground")}
                >
                  {triggerLabel}
                </span>
                <ChevronsUpDownIcon className="ml-2 h-4 w-4 shrink-0 opacity-50" />
              </Button>
            </PopoverTrigger>
            <PopoverContent align="start" className="w-[var(--radix-popover-trigger-width)] p-0">
              <Command>
                <CommandInput
                  value={searchValue}
                  onValueChange={setSearchValue}
                  placeholder="Filter environments"
                />
                <CommandList>
                  <CommandEmpty>No environment found.</CommandEmpty>
                  <CommandGroup>
                    {availableEnvs.map((env) => (
                      <CommandItem
                        key={env.id}
                        value={env.id}
                        keywords={[env.name, env.slug]}
                        onSelect={toggleEnv}
                        title={env.name}
                      >
                        <CheckIcon
                          className={cn(
                            "h-4 w-4 shrink-0",
                            selectedEnvIds.includes(env.id) ? "opacity-100" : "opacity-0"
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
        </div>

        <div className="flex flex-col gap-1.5">
          <p className="text-muted-foreground text-xs font-medium tracking-wide uppercase">
            Include values
          </p>
          <div className="divide-y divide-border rounded-md border border-border">
            {INCLUDE_OPTIONS.map((opt) => {
              const id = `duplicate-include-${opt.key}`;
              return (
                <label
                  key={opt.key}
                  htmlFor={id}
                  className="flex cursor-pointer items-start gap-3 p-3"
                >
                  <Checkbox
                    id={id}
                    variant="project"
                    isChecked={includeOptions[opt.key]}
                    onCheckedChange={() => toggleInclude(opt.key)}
                    className="mt-0.5"
                  />
                  <div className="flex flex-col gap-0.5">
                    <span className="text-sm text-foreground">{opt.label}</span>
                    <span className="text-muted-foreground text-xs">{opt.description}</span>
                  </div>
                </label>
              );
            })}
          </div>
        </div>

        <DialogFooter>
          <DialogClose asChild>
            <Button variant="outline">Cancel</Button>
          </DialogClose>
          <Button
            variant="project"
            isDisabled={selectedEnvIds.length === 0}
            onClick={() => onOpenChange(false)}
          >
            <CopyIcon />
            {actionLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
