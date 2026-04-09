import { useEffect, useState } from "react";
import { Control, Controller, FieldErrors, useFieldArray, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { CircleMinus, Plus, Trash2 } from "lucide-react";
import { z } from "zod";

import { createNotification } from "@app/components/notifications";
import {
  Badge,
  Button,
  Command,
  CommandGroup,
  CommandItem,
  CommandList,
  Field,
  FieldContent,
  FieldError,
  FieldLabel,
  Label,
  Popover,
  PopoverContent,
  PopoverTrigger,
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
  Switch,
  TextArea,
  Tooltip,
  TooltipContent,
  TooltipTrigger,
  UnstableIconButton,
  UnstableInput
} from "@app/components/v3";
import {
  PamAccountPolicyRuleType,
  TPamAccountPolicy,
  TPamAccountPolicyRules,
  useCreatePamAccountPolicy,
  useUpdatePamAccountPolicy
} from "@app/hooks/api/pam";
import { PAM_RESOURCE_TYPE_MAP } from "@app/hooks/api/pam/maps";

import {
  PAM_ACCOUNT_POLICY_RULE_METADATA,
  PAM_ACCOUNT_POLICY_RULE_SUPPORTED_RESOURCES
} from "./constants";

const isValidRegex = (pattern: string) => {
  try {
    // eslint-disable-next-line no-new
    new RegExp(pattern);
    return true;
  } catch {
    return false;
  }
};

const RulePatternSchema = z.object({
  value: z
    .string()
    .min(1, "Pattern is required")
    .max(500, "Pattern must be at most 500 characters")
    .refine(isValidRegex, { message: "Invalid regular expression" })
});

const RuleSchema = z.object({
  ruleType: z.nativeEnum(PamAccountPolicyRuleType),
  patterns: z
    .array(RulePatternSchema)
    .min(1, "At least one pattern is required")
    .max(20, "A rule can have at most 20 patterns")
});

const FormSchema = z.object({
  name: z.string().trim().min(1, "Name is required").max(255),
  description: z.string().trim().max(1000).optional(),
  rules: z.array(RuleSchema).min(1, "At least one rule is required")
});

type TFormData = z.infer<typeof FormSchema>;

type Props = {
  isOpen: boolean;
  onOpenChange: (isOpen: boolean) => void;
  projectId: string;
  policy?: TPamAccountPolicy;
};

const rulesToFormData = (rules: TPamAccountPolicyRules): TFormData["rules"] => {
  return (Object.entries(rules) as [PamAccountPolicyRuleType, { patterns: string[] }][])
    .filter(([, config]) => config?.patterns)
    .map(([ruleType, config]) => ({
      ruleType,
      patterns: config.patterns.map((p) => ({ value: p }))
    }));
};

const formDataToRules = (rules: TFormData["rules"]): TPamAccountPolicyRules => {
  return rules.reduce<TPamAccountPolicyRules>((acc, rule) => {
    acc[rule.ruleType] = {
      patterns: rule.patterns.map((p) => p.value)
    };
    return acc;
  }, {});
};

const RuleSupportedResourceIndicator = ({ ruleType }: { ruleType: PamAccountPolicyRuleType }) => {
  const supported = PAM_ACCOUNT_POLICY_RULE_SUPPORTED_RESOURCES[ruleType];

  if (supported === "all") {
    return (
      <Tooltip>
        <TooltipTrigger asChild>
          <Badge variant="neutral">All</Badge>
        </TooltipTrigger>
        <TooltipContent>Supported by all resource types</TooltipContent>
      </Tooltip>
    );
  }

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <div className="flex items-center gap-1">
          {supported.map((rt) => {
            const mapEntry = PAM_RESOURCE_TYPE_MAP[rt];
            if (!mapEntry) return null;
            return (
              <Badge key={rt} variant="neutral">
                {mapEntry.name}
              </Badge>
            );
          })}
        </div>
      </TooltipTrigger>
      <TooltipContent>
        Supported by{" "}
        {(() => {
          const names = supported.map((rt) => PAM_RESOURCE_TYPE_MAP[rt]?.name).filter(Boolean);
          if (names.length <= 1) return names[0];
          return `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;
        })()}
      </TooltipContent>
    </Tooltip>
  );
};

const RulePatterns = ({
  control,
  ruleIndex,
  errors
}: {
  control: Control<TFormData>;
  ruleIndex: number;
  errors: FieldErrors<TFormData>;
}) => {
  const { fields, append, remove } = useFieldArray({
    control,
    name: `rules.${ruleIndex}.patterns` as const
  });

  return (
    <div className="space-y-1.5">
      {fields.map((patternField, patternIndex) => {
        const patternError = errors?.rules?.[ruleIndex]?.patterns?.[patternIndex]?.value;
        return (
          <div key={patternField.id}>
            <div className="flex items-center gap-1.5">
              <Controller
                control={control}
                name={`rules.${ruleIndex}.patterns.${patternIndex}.value`}
                render={({ field }) => (
                  <UnstableInput
                    {...field}
                    placeholder="Regex pattern, e.g. rm\\s+-rf"
                    className="flex-1 font-mono text-xs"
                    isError={!!patternError}
                  />
                )}
              />
              <UnstableIconButton
                variant="ghost"
                size="xs"
                aria-label="Remove pattern"
                onClick={() => remove(patternIndex)}
                disabled={fields.length <= 1}
              >
                <CircleMinus className="h-3.5 w-3.5 text-mineshaft-400" />
              </UnstableIconButton>
            </div>
            {patternError && <p className="mt-1 text-xs text-danger">{patternError.message}</p>}
          </div>
        );
      })}
      <Tooltip>
        <TooltipTrigger asChild>
          <span>
            <Button
              variant="outline"
              size="xs"
              onClick={() => append({ value: "" })}
              disabled={fields.length >= 20}
            >
              <Plus className="mr-1 h-3 w-3" />
              Add Pattern
            </Button>
          </span>
        </TooltipTrigger>
        {fields.length >= 20 && <TooltipContent>Max of 20 allowed</TooltipContent>}
      </Tooltip>
    </div>
  );
};

export const PolicySheet = ({ isOpen, onOpenChange, projectId, policy }: Props) => {
  const isEditing = !!policy;
  const createPolicy = useCreatePamAccountPolicy();
  const updatePolicy = useUpdatePamAccountPolicy();
  const [addRuleOpen, setAddRuleOpen] = useState(false);
  const [isActive, setIsActive] = useState(true);

  const {
    control,
    handleSubmit,
    reset,
    formState: { isSubmitting, isDirty, errors },
    watch
  } = useForm<TFormData>({
    resolver: zodResolver(FormSchema),
    defaultValues: {
      name: "",
      description: "",
      rules: []
    }
  });

  const {
    fields: ruleFields,
    append: appendRule,
    remove: removeRule
  } = useFieldArray({ control, name: "rules" });

  const currentRules = watch("rules");

  useEffect(() => {
    if (isOpen) {
      if (policy) {
        reset({
          name: policy.name,
          description: policy.description ?? "",
          rules: rulesToFormData(policy.rules)
        });
        setIsActive(policy.isActive);
      } else {
        reset({ name: "", description: "", rules: [] });
        setIsActive(true);
      }
    }
  }, [isOpen, policy, reset]);

  const onSubmit = async (data: TFormData) => {
    try {
      const rules = formDataToRules(data.rules);

      if (isEditing) {
        await updatePolicy.mutateAsync({
          policyId: policy.id,
          name: data.name,
          description: data.description || null,
          rules,
          isActive
        });
        createNotification({ text: "Policy updated successfully", type: "success" });
      } else {
        await createPolicy.mutateAsync({
          projectId,
          name: data.name,
          description: data.description,
          rules
        });
        createNotification({ text: "Policy created successfully", type: "success" });
      }
      onOpenChange(false);
    } catch {
      createNotification({
        text: `Failed to ${isEditing ? "update" : "create"} policy`,
        type: "error"
      });
    }
  };

  const addedRuleTypes = new Set(currentRules.map((r) => r.ruleType));

  return (
    <Sheet open={isOpen} onOpenChange={onOpenChange}>
      <SheetContent className="flex h-full max-h-full flex-col gap-y-0 sm:max-w-lg">
        <SheetHeader className="border-b">
          <SheetTitle>{isEditing ? "Edit Policy" : "Create Policy"}</SheetTitle>
          <SheetDescription>
            {isEditing
              ? "Update the policy name, description, and rules."
              : "Configure behavioral rules for accounts."}
          </SheetDescription>
        </SheetHeader>

        {isEditing && (
          <div className="flex items-center justify-between border-b border-border px-6 py-3">
            <span className="text-xs text-muted">{isActive ? "Enabled" : "Disabled"}</span>
            <Switch checked={isActive} onCheckedChange={setIsActive} variant="project" />
          </div>
        )}

        <form onSubmit={handleSubmit(onSubmit)} className="flex flex-1 flex-col overflow-hidden">
          <div
            className={`flex min-h-0 flex-1 shrink flex-col gap-4 overflow-y-auto p-4 pb-8 transition-opacity ${!isActive ? "pointer-events-none opacity-40" : ""}`}
          >
            <Controller
              control={control}
              name="name"
              render={({ field, fieldState: { error } }) => (
                <Field>
                  <FieldLabel>Name</FieldLabel>
                  <FieldContent>
                    <UnstableInput
                      {...field}
                      placeholder="e.g. Production SSH Policy"
                      isError={Boolean(error)}
                    />
                    <FieldError errors={[error]} />
                  </FieldContent>
                </Field>
              )}
            />

            <Controller
              control={control}
              name="description"
              render={({ field, fieldState: { error } }) => (
                <Field>
                  <FieldLabel>Description (optional)</FieldLabel>
                  <FieldContent>
                    <TextArea
                      {...field}
                      className="max-h-32"
                      placeholder="Brief description of this policy"
                    />
                    <FieldError errors={[error]} />
                  </FieldContent>
                </Field>
              )}
            />

            <div className="flex flex-col gap-3">
              <div className="flex items-center justify-between">
                <Label>Rules</Label>
                <Popover open={addRuleOpen} onOpenChange={setAddRuleOpen}>
                  <PopoverTrigger asChild>
                    <Button variant="outline" size="xs">
                      <Plus className="mr-1 h-3 w-3" />
                      Add Rule
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-72 p-0" align="end">
                    <Command>
                      <CommandList>
                        <CommandGroup>
                          {Object.values(PamAccountPolicyRuleType).map((ruleType) => {
                            const meta = PAM_ACCOUNT_POLICY_RULE_METADATA[ruleType];
                            const isAdded = addedRuleTypes.has(ruleType);
                            return (
                              <CommandItem
                                key={ruleType}
                                disabled={isAdded}
                                onSelect={() => {
                                  if (!isAdded) {
                                    appendRule({ ruleType, patterns: [{ value: "" }] });
                                    setAddRuleOpen(false);
                                  }
                                }}
                                className="flex items-center justify-between gap-2"
                              >
                                <span className="text-sm font-medium">
                                  {isAdded ? (
                                    <span className="text-mineshaft-400">{meta.name}</span>
                                  ) : (
                                    meta.name
                                  )}
                                </span>
                              </CommandItem>
                            );
                          })}
                        </CommandGroup>
                      </CommandList>
                    </Command>
                  </PopoverContent>
                </Popover>
              </div>

              {ruleFields.map((ruleField, ruleIndex) => {
                const ruleType = currentRules[ruleIndex]?.ruleType;
                if (!ruleType) return null;
                const meta = PAM_ACCOUNT_POLICY_RULE_METADATA[ruleType];

                return (
                  <div key={ruleField.id} className="rounded-md border border-border bg-card p-4">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium text-foreground">{meta.name}</span>
                        {ruleType && <RuleSupportedResourceIndicator ruleType={ruleType} />}
                      </div>
                      <UnstableIconButton
                        variant="danger"
                        size="xs"
                        aria-label="Remove rule"
                        onClick={() => removeRule(ruleIndex)}
                      >
                        <Trash2 className="size-3.5" />
                      </UnstableIconButton>
                    </div>
                    {meta.description && (
                      <p className="mt-2 text-xs text-muted">{meta.description}</p>
                    )}

                    <div className="mt-3">
                      <RulePatterns control={control} ruleIndex={ruleIndex} errors={errors} />
                    </div>
                  </div>
                );
              })}

              {ruleFields.length === 0 && (
                <div className="rounded-md border border-dashed border-border py-8 text-center">
                  <p className="text-sm text-muted">No rules added yet</p>
                  {(errors.rules?.root?.message || errors.rules?.message) && (
                    <p className="mt-1 text-xs text-danger">
                      {errors.rules?.root?.message || errors.rules?.message}
                    </p>
                  )}
                </div>
              )}

              {ruleFields.length > 0 && (errors.rules?.root?.message || errors.rules?.message) && (
                <p className="mt-1 text-xs text-danger">
                  {errors.rules?.root?.message || errors.rules?.message}
                </p>
              )}
            </div>
          </div>

          <SheetFooter className="shrink-0 border-t">
            <Button
              isPending={isSubmitting}
              isDisabled={isSubmitting || (!isDirty && isActive === policy?.isActive)}
              variant="project"
              type="submit"
            >
              {isEditing ? "Save Changes" : "Create Policy"}
            </Button>
            <Button
              onClick={() => onOpenChange(false)}
              variant="outline"
              className="mr-auto"
              type="button"
            >
              Cancel
            </Button>
          </SheetFooter>
        </form>
      </SheetContent>
    </Sheet>
  );
};
