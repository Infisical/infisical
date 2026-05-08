import { useState } from "react";
import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import {
  CheckCircleIcon,
  CheckIcon,
  ChevronsUpDownIcon,
  CircleAlertIcon,
  CopyIcon,
  InfoIcon,
  KeyIcon,
  LoaderCircleIcon
} from "lucide-react";
import { twMerge } from "tailwind-merge";
import { z } from "zod";

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
  Field,
  FieldContent,
  FieldDescription,
  FieldLabel,
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

const formSchema = z.object({
  environmentIds: z.array(z.string()).min(1),
  include: z.object({
    value: z.boolean(),
    comment: z.boolean(),
    tags: z.boolean(),
    metadata: z.boolean(),
    skipMultilineEncoding: z.boolean()
  }),
  shouldOverwrite: z.boolean()
});

type FormValues = z.infer<typeof formSchema>;

enum DuplicateStatus {
  Success = "success",
  Info = "info",
  Error = "error"
}

type DuplicateResults = {
  status: DuplicateStatus;
  name: string;
  id: string;
  message: string;
}[];

const DuplicateResultsView = ({
  results,
  onDismiss
}: {
  results: DuplicateResults;
  onDismiss: () => void;
}) => (
  <div className="w-full">
    <div className="mb-2 text-sm font-medium">Results</div>
    <div className="mb-4 flex flex-col divide-y divide-border rounded-md border border-border bg-container px-2 py-2">
      {results.map(({ id, name, status, message }) => {
        let resultClassName: string;
        let Icon: typeof CheckCircleIcon;

        switch (status) {
          case DuplicateStatus.Success:
            Icon = CheckCircleIcon;
            resultClassName = "text-success";
            break;
          case DuplicateStatus.Info:
            Icon = InfoIcon;
            resultClassName = "text-info";
            break;
          case DuplicateStatus.Error:
          default:
            Icon = CircleAlertIcon;
            resultClassName = "text-danger";
        }

        return (
          <div key={id} className="flex items-start gap-2 p-2 text-sm">
            <Icon className={twMerge(resultClassName, "mt-0.5 size-3.5 shrink-0")} />
            <span>
              {name}: {message}
            </span>
          </div>
        );
      })}
    </div>
    <DialogFooter>
      <DialogClose asChild>
        <Button variant="outline" onClick={onDismiss}>
          Dismiss
        </Button>
      </DialogClose>
    </DialogFooter>
  </div>
);

type Props = {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  secretId?: string;
  secretName: string;
  secretPath: string;
  sourceEnvironment: { slug: string; name: string };
};

type ContentProps = Omit<Props, "isOpen" | "onOpenChange"> & {
  onClose: () => void;
};

const DuplicateSecretContent = ({
  secretId,
  secretName,
  secretPath,
  sourceEnvironment,
  onClose
}: ContentProps) => {
  const {
    currentProject: { id: projectId, environments }
  } = useProject();
  const duplicateSecret = useDuplicateSecret();

  const {
    handleSubmit,
    control,
    watch,
    formState: { isSubmitting }
  } = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      environmentIds: [],
      include: DEFAULT_INCLUDE,
      shouldOverwrite: false
    }
  });

  const [duplicateResults, setDuplicateResults] = useState<DuplicateResults | null>(null);
  const [popoverOpen, setPopoverOpen] = useState(false);
  const [searchValue, setSearchValue] = useState("");

  const selectedEnvIds = watch("environmentIds");
  const availableEnvs = environments.filter((env) => env.slug !== sourceEnvironment.slug);

  const handleFormSubmit = async (data: FormValues) => {
    if (!secretId || data.environmentIds.length === 0) return;

    const targets = data.environmentIds
      .map((id) => availableEnvs.find((env) => env.id === id))
      .filter((env): env is (typeof availableEnvs)[number] => Boolean(env));

    const settled = await Promise.allSettled(
      targets.map((env) =>
        duplicateSecret.mutateAsync({
          projectId,
          sourceEnvironment: sourceEnvironment.slug,
          sourceSecretPath: secretPath,
          destinationEnvironment: env.slug,
          destinationSecretPath: secretPath,
          secretId,
          shouldOverwrite: data.shouldOverwrite,
          attributesToCopy: data.include
        })
      )
    );

    const results: DuplicateResults = settled.map((result, idx) => {
      const env = targets[idx];

      if (result.status === "fulfilled") {
        if ("approval" in result.value) {
          return {
            id: env.id,
            name: env.name,
            status: DuplicateStatus.Info,
            message: "A secret approval request has been generated"
          };
        }
        return {
          id: env.id,
          name: env.name,
          status: DuplicateStatus.Success,
          message: "Successfully duplicated secret"
        };
      }

      const reason = result.reason as {
        response?: { data?: { message?: string } };
        message?: string;
      };
      return {
        id: env.id,
        name: env.name,
        status: DuplicateStatus.Error,
        message: reason?.response?.data?.message ?? reason?.message ?? "Unknown error"
      };
    });

    setDuplicateResults(results);
  };

  if (duplicateResults) {
    return <DuplicateResultsView results={duplicateResults} onDismiss={onClose} />;
  }

  if (duplicateSecret.isPending) {
    return (
      <div className="flex h-full flex-col items-center justify-center py-2.5">
        <LoaderCircleIcon className="size-8 animate-spin text-accent" />
        <p className="mt-4 text-sm text-accent">Duplicating secret...</p>
      </div>
    );
  }

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
    <form onSubmit={handleSubmit(handleFormSubmit)}>
      <Field>
        <FieldLabel>Source</FieldLabel>
        <FieldContent>
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
        </FieldContent>
      </Field>

      <Controller
        control={control}
        name="environmentIds"
        render={({ field: { value, onChange } }) => {
          const toggleEnv = (envId: string) => {
            if (value.includes(envId)) {
              onChange(value.filter((id) => id !== envId));
            } else {
              onChange([...value, envId]);
            }
          };

          return (
            <Field className="mt-4">
              <FieldLabel>Target Environments</FieldLabel>
              <FieldContent>
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
                        className={cn("truncate", value.length === 0 && "text-muted-foreground")}
                      >
                        {triggerLabel}
                      </span>
                      <ChevronsUpDownIcon className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent
                    align="start"
                    className="w-[var(--radix-popover-trigger-width)] p-0"
                  >
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
                                  value.includes(env.id) ? "opacity-100" : "opacity-0"
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
                <FieldDescription>Pick one or more destinations.</FieldDescription>
              </FieldContent>
            </Field>
          );
        }}
      />

      <Controller
        control={control}
        name="include"
        render={({ field: { value, onChange } }) => (
          <Field className="mt-4">
            <FieldLabel>Include values</FieldLabel>
            <FieldContent>
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
                        isChecked={value[opt.key]}
                        onCheckedChange={() => onChange({ ...value, [opt.key]: !value[opt.key] })}
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
            </FieldContent>
          </Field>
        )}
      />

      <Controller
        control={control}
        name="shouldOverwrite"
        render={({ field: { onBlur, value, onChange } }) => (
          <Field className="mt-4">
            <Field orientation="horizontal">
              <Checkbox
                id="duplicate-overwrite"
                isChecked={value}
                onCheckedChange={onChange}
                onBlur={onBlur}
                variant="project"
              />
              <FieldLabel htmlFor="duplicate-overwrite" className="cursor-pointer">
                Overwrite existing secret
              </FieldLabel>
            </Field>
            <FieldDescription>
              {value
                ? "Secrets with conflicting keys at the destination will be overwritten"
                : "Secrets with conflicting keys at the destination will not be overwritten"}
            </FieldDescription>
          </Field>
        )}
      />

      <DialogFooter className="mt-6">
        <DialogClose asChild>
          <Button variant="outline">Cancel</Button>
        </DialogClose>
        <Button
          type="submit"
          variant="project"
          isDisabled={selectedEnvIds.length === 0 || !secretId || isSubmitting}
          isPending={isSubmitting}
        >
          <CopyIcon />
          {actionLabel}
        </Button>
      </DialogFooter>
    </form>
  );
};

export const DuplicateSecretModal = ({ isOpen, onOpenChange, ...props }: Props) => (
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
      <DuplicateSecretContent {...props} onClose={() => onOpenChange(false)} />
    </DialogContent>
  </Dialog>
);
