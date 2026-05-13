import { Controller, useForm } from "react-hook-form";
import type { MultiValue } from "react-select";
import { zodResolver } from "@hookform/resolvers/zod";
import { KeyIcon, LoaderCircleIcon, PlusIcon } from "lucide-react";
import { z } from "zod";

import { createNotification } from "@app/components/notifications";
import {
  Badge,
  Button,
  Checkbox,
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
  FieldLabel
} from "@app/components/v3";
import { FilterableSelect } from "@app/components/v3/generic/ReactSelect";
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

export type DuplicateSecretTarget = { id: string; name: string };

type Props = {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  secrets: DuplicateSecretTarget[];
  secretPath: string;
  sourceEnvironment: { slug: string; name: string };
};

type ContentProps = Omit<Props, "isOpen" | "onOpenChange"> & {
  onClose: () => void;
};

type EnvironmentOption = {
  id: string;
  name: string;
  slug: string;
};

const DuplicateSecretContent = ({
  secrets,
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

  const selectedEnvIds = watch("environmentIds");
  const includeSelection = watch("include");
  const hasSelectedIncludeOption = Object.values(includeSelection).some(Boolean);
  const availableEnvs = environments.filter((env) => env.slug !== sourceEnvironment.slug);
  const hasSecretsToDuplicate = secrets.length > 0;

  const handleFormSubmit = async (data: FormValues) => {
    if (!hasSecretsToDuplicate || data.environmentIds.length === 0) return;

    const targets = data.environmentIds
      .map((id) => availableEnvs.find((env) => env.id === id))
      .filter((env): env is (typeof availableEnvs)[number] => Boolean(env));

    const secretIds = secrets.map((s) => s.id);

    const settled = await Promise.allSettled(
      targets.map((env) =>
        duplicateSecret.mutateAsync({
          projectId,
          sourceEnvironment: sourceEnvironment.slug,
          sourceSecretPath: secretPath,
          destinationEnvironment: env.slug,
          destinationSecretPath: secretPath,
          secretIds,
          shouldOverwrite: data.shouldOverwrite,
          attributesToCopy: data.include
        })
      )
    );

    const successEnvs: { name: string }[] = [];
    const approvalEnvs: { name: string }[] = [];
    const failures: { name: string; message: string }[] = [];

    settled.forEach((result, idx) => {
      const env = targets[idx];

      if (result.status === "fulfilled") {
        const hasApproval = result.value.results.some((entry) => "approval" in entry);
        if (hasApproval) {
          approvalEnvs.push({ name: env.name });
        } else {
          successEnvs.push({ name: env.name });
        }
        return;
      }

      const reason = result.reason as {
        response?: { data?: { message?: string } };
        message?: string;
      };
      failures.push({
        name: env.name,
        message: reason?.response?.data?.message ?? reason?.message ?? "Unknown error"
      });
    });

    if (successEnvs.length > 0) {
      const secretLabel = secrets.length === 1 ? "secret" : `${secrets.length} secrets`;
      const text =
        successEnvs.length === 1
          ? `Successfully duplicated ${secretLabel} to ${successEnvs[0].name}`
          : `Successfully duplicated ${secretLabel} to ${successEnvs.length} environments`;
      createNotification({ type: "success", text });
    }

    if (approvalEnvs.length > 0) {
      const text =
        approvalEnvs.length === 1
          ? `Secret approval request generated for ${approvalEnvs[0].name}`
          : `Secret approval requests generated for ${approvalEnvs.length} environments`;
      createNotification({ type: "info", text });
    }

    onClose();
  };

  if (duplicateSecret.isPending) {
    return (
      <div className="flex h-full flex-col items-center justify-center py-2.5">
        <LoaderCircleIcon className="size-8 animate-spin text-accent" />
        <p className="mt-4 text-sm text-accent">Duplicating secret...</p>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit(handleFormSubmit)}>
      <Field>
        <FieldLabel>Source</FieldLabel>
        <FieldContent>
          <div className="max-h-48 thin-scrollbar divide-y divide-border overflow-y-auto rounded-md border border-border bg-container">
            {secrets.map((s) => (
              <div
                key={s.id}
                className="grid min-w-0 grid-cols-[minmax(0,1fr)_minmax(0,40%)] items-center gap-2 px-3 py-2"
              >
                <div className="flex min-w-0 flex-1 items-center gap-2 overflow-hidden text-sm text-foreground">
                  <KeyIcon className="text-muted-foreground size-3.5 shrink-0" />
                  {secretPath !== "/" && (
                    <span className="text-muted-foreground/60 truncate">{secretPath}</span>
                  )}
                  <span className="truncate">{s.name}</span>
                </div>
                <Badge
                  variant="info"
                  className="max-w-full min-w-0 justify-self-end"
                  isTruncatable
                  title={sourceEnvironment.name}
                >
                  <span className="block max-w-full">{sourceEnvironment.name}</span>
                </Badge>
              </div>
            ))}
          </div>
          {secrets.length > 1 && (
            <FieldDescription>
              {secrets.length} secrets will be duplicated into each selected destination.
            </FieldDescription>
          )}
        </FieldContent>
      </Field>

      <Controller
        control={control}
        name="environmentIds"
        render={({ field: { value, onChange } }) => {
          const options: EnvironmentOption[] = availableEnvs.map((env) => ({
            id: env.id,
            name: env.name,
            slug: env.slug
          }));
          const selectedOptions = options.filter((option) => value.includes(option.id));

          return (
            <Field className="mt-4">
              <FieldLabel>Target Environments</FieldLabel>
              <FieldContent>
                <FilterableSelect
                  isMulti
                  options={options}
                  value={selectedOptions}
                  onChange={(nextOptions) =>
                    onChange(
                      (nextOptions as MultiValue<EnvironmentOption>).map((option) => option.id)
                    )
                  }
                  placeholder="Search environments..."
                  getOptionLabel={(option) => option.name}
                  getOptionValue={(option) => option.id}
                  filterOption={(candidate, input) => {
                    const normalizedQuery = input.trim().toLowerCase();
                    if (!normalizedQuery) return true;

                    return (
                      candidate.data.name.toLowerCase().includes(normalizedQuery) ||
                      candidate.data.slug.toLowerCase().includes(normalizedQuery)
                    );
                  }}
                />
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
            <FieldLabel>Include properties</FieldLabel>
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
                        <span className="text-xs text-muted">{opt.description}</span>
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
          isDisabled={
            selectedEnvIds.length === 0 ||
            !hasSecretsToDuplicate ||
            isSubmitting ||
            !hasSelectedIncludeOption
          }
          isPending={isSubmitting}
        >
          <PlusIcon /> Duplicate
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
          <DialogTitle>Duplicate Secret</DialogTitle>
        </div>
        <DialogDescription>
          Copy the selected secret{props.secrets.length > 1 ? "s" : ""} and their metadata into one
          or more environments.
        </DialogDescription>
      </DialogHeader>
      <DuplicateSecretContent {...props} onClose={() => onOpenChange(false)} />
    </DialogContent>
  </Dialog>
);
