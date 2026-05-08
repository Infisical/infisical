import { useEffect, useState } from "react";
import { CheckIcon, ChevronsUpDownIcon, CopyIcon, KeyIcon } from "lucide-react";

import { createNotification } from "@app/components/notifications";
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
import { useDuplicateSecret } from "@app/hooks/api/secrets";

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
  secretId?: string;
  secretName: string;
  secretPath: string;
  sourceEnvironment: { slug: string; name: string };
};

export const DuplicateSecretModal = ({
  isOpen,
  onOpenChange,
  secretId,
  secretName,
  secretPath,
  sourceEnvironment
}: Props) => {
  const {
    currentProject: { id: projectId, environments }
  } = useProject();
  const duplicateSecret = useDuplicateSecret();

  const [selectedEnvIds, setSelectedEnvIds] = useState<string[]>([]);
  const [includeOptions, setIncludeOptions] =
    useState<Record<IncludeKey, boolean>>(DEFAULT_INCLUDE);
  const [shouldOverwrite, setShouldOverwrite] = useState(false);
  const [popoverOpen, setPopoverOpen] = useState(false);
  const [searchValue, setSearchValue] = useState("");

  useEffect(() => {
    if (!isOpen) {
      setSelectedEnvIds([]);
      setIncludeOptions(DEFAULT_INCLUDE);
      setShouldOverwrite(false);
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

  const handleDuplicate = async () => {
    if (!secretId || selectedEnvIds.length === 0) return;

    const targets = selectedEnvIds
      .map((id) => availableEnvs.find((env) => env.id === id))
      .filter((env): env is (typeof availableEnvs)[number] => Boolean(env));

    const results = await Promise.allSettled(
      targets.map((env) =>
        duplicateSecret.mutateAsync({
          projectId,
          sourceEnvironment: sourceEnvironment.slug,
          sourceSecretPath: secretPath,
          destinationEnvironment: env.slug,
          destinationSecretPath: secretPath,
          secretId,
          shouldOverwrite,
          attributesToCopy: includeOptions
        })
      )
    );

    let successCount = 0;
    let approvalCount = 0;
    const failures: { env: string; message: string }[] = [];

    results.forEach((result, idx) => {
      const envName = targets[idx].name;
      if (result.status === "fulfilled") {
        if ("approval" in result.value) {
          approvalCount += 1;
        } else {
          successCount += 1;
        }
      } else {
        const reason = result.reason as {
          response?: { data?: { message?: string } };
          message?: string;
        };
        failures.push({
          env: envName,
          message: reason?.response?.data?.message ?? reason?.message ?? "Unknown error"
        });
      }
    });

    if (successCount > 0) {
      createNotification({
        type: "success",
        text: `Duplicated '${secretName}' to ${successCount} environment${successCount === 1 ? "" : "s"}`
      });
    }
    if (approvalCount > 0) {
      createNotification({
        type: "info",
        text: `${approvalCount} environment${approvalCount === 1 ? "" : "s"} require approval before the secret is created`
      });
    }
    failures.forEach(({ env, message }) => {
      createNotification({
        type: "error",
        text: `Failed to duplicate to ${env}: ${message}`
      });
    });

    if (failures.length === 0) {
      onOpenChange(false);
    }
  };

  const selectedEnvCount = selectedEnvIds.length;
  const singleSelectedEnvName =
    selectedEnvCount === 1
      ? (availableEnvs.find((e) => e.id === selectedEnvIds[0])?.name ?? null)
      : null;

  let triggerLabel: string;
  if (selectedEnvCount === 0) {
    triggerLabel = "Search environments...";
  } else if (selectedEnvCount === 1) {
    triggerLabel = singleSelectedEnvName ?? "1 environment";
  } else {
    triggerLabel = `${selectedEnvCount} environments`;
  }

  let actionLabel: string;
  if (selectedEnvCount === 0) {
    actionLabel = "Duplicate to ...";
  } else if (selectedEnvCount === 1) {
    actionLabel = `Duplicate to ${singleSelectedEnvName ?? "environment"}`;
  } else {
    actionLabel = `Duplicate to ${selectedEnvCount} environments`;
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

        <div className="flex flex-col gap-1.5">
          <p className="text-muted-foreground text-xs font-medium tracking-wide uppercase">
            If a secret with the same key already exists
          </p>
          {/* eslint-disable-next-line jsx-a11y/label-has-associated-control */}
          <label
            htmlFor="duplicate-overwrite"
            className="flex cursor-pointer items-start gap-3 rounded-md border border-border p-3"
          >
            <Checkbox
              id="duplicate-overwrite"
              variant="project"
              isChecked={shouldOverwrite}
              onCheckedChange={(checked) => setShouldOverwrite(Boolean(checked))}
              className="mt-0.5"
            />
            <div className="flex flex-col gap-0.5">
              <span className="text-sm text-foreground">Overwrite existing secret</span>
              <span className="text-muted-foreground text-xs">
                Replace the destination secret&apos;s selected fields with the values from the
                source. Without this, duplication fails for environments that already have a secret
                with this key.
              </span>
            </div>
          </label>
        </div>

        <DialogFooter>
          <DialogClose asChild>
            <Button variant="outline">Cancel</Button>
          </DialogClose>
          <Button
            variant="project"
            isDisabled={selectedEnvIds.length === 0 || !secretId}
            isPending={duplicateSecret.isPending}
            onClick={handleDuplicate}
          >
            <CopyIcon />
            {actionLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
