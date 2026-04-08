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
import { slugSchema } from "@app/lib/schemas";

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
  name: slugSchema({ field: "Name", max: 255 }),
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
        <TooltipTrigger>
          <Badge variant="info">All</Badge>
        </TooltipTrigger>
        <TooltipContent>Supported by all resource types</TooltipContent>
      </Tooltip>
    );
  }

  return (
    <div className="flex items-center gap-1">
      {supported.map((rt) => {
        const mapEntry = PAM_RESOURCE_TYPE_MAP[rt];
        if (!mapEntry) return null;
        return (
          <Tooltip key={rt}>
            <TooltipTrigger>
              <img
                src={`/images/integrations/${mapEntry.image}`}
                alt={mapEntry.name}
                className="h-4 w-4"
              />
            </TooltipTrigger>
            <TooltipContent>{mapEntry.name}</TooltipContent>
          </Tooltip>
        );
      })}
    </div>
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
      {fields.map((patternField, patternIndex) => (
        <div key={patternField.id} className="flex items-center gap-1.5">
          <Controller
            control={control}
            name={`rules.${ruleIndex}.patterns.${patternIndex}.value`}
            render={({ field }) => (
              <UnstableInput
                {...field}
                placeholder="Regex pattern, e.g. rm\\s+-rf"
                className="flex-1 font-mono text-xs"
                isError={!!errors?.rules?.[ruleIndex]?.patterns?.[patternIndex]?.value}
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
      ))}
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
      } else {
        reset({ name: "", description: "", rules: [] });
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
          rules
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
              : "Configure behavioral rules for PAM accounts."}
          </SheetDescription>
        </SheetHeader>

        <form onSubmit={handleSubmit(onSubmit)} className="flex flex-1 flex-col overflow-hidden">
          <div className="flex min-h-0 flex-1 shrink flex-col gap-4 overflow-y-auto p-4 pb-8">
            <Controller
              control={control}
              name="name"
              render={({ field, fieldState: { error } }) => (
                <Field>
                  <FieldLabel>Name</FieldLabel>
                  <FieldContent>
                    <UnstableInput
                      {...field}
                      placeholder="my-policy-name"
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
                  <FieldLabel>Description</FieldLabel>
                  <FieldContent>
                    <TextArea {...field} className="max-h-32" placeholder="Optional description" />
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
                                <div className="flex items-center gap-2">
                                  <span className="text-sm font-medium">
                                    {isAdded ? (
                                      <span className="text-mineshaft-400">{meta.name}</span>
                                    ) : (
                                      meta.name
                                    )}
                                  </span>
                                  <RuleSupportedResourceIndicator ruleType={ruleType} />
                                </div>
                              </CommandItem>
                            );
                          })}
                        </CommandGroup>
                      </CommandList>
                    </Command>
                  </PopoverContent>
                </Popover>
              </div>

              {errors.rules && !Array.isArray(errors.rules) && (
                <FieldError errors={[errors.rules]} />
              )}

              {ruleFields.map((ruleField, ruleIndex) => {
                const ruleType = currentRules[ruleIndex]?.ruleType;
                if (!ruleType) return null;
                const meta = PAM_ACCOUNT_POLICY_RULE_METADATA[ruleType];

                return (
                  <div key={ruleField.id} className="rounded-md border border-mineshaft-600 p-3">
                    <div className="mb-1 flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium">{meta.name}</span>
                        {ruleType && <RuleSupportedResourceIndicator ruleType={ruleType} />}
                      </div>
                      <UnstableIconButton
                        variant="ghost"
                        size="xs"
                        aria-label="Remove rule"
                        onClick={() => removeRule(ruleIndex)}
                      >
                        <Trash2 className="h-4 w-4 text-red-500" />
                      </UnstableIconButton>
                    </div>
                    {meta.description && (
                      <p className="mb-2 text-xs text-mineshaft-400">{meta.description}</p>
                    )}

                    <RulePatterns control={control} ruleIndex={ruleIndex} errors={errors} />
                  </div>
                );
              })}

              {ruleFields.length === 0 && (
                <p className="text-center text-xs text-muted">
                  No rules added yet. Click &quot;Add Rule&quot; to get started.
                </p>
              )}
            </div>
          </div>

          <SheetFooter className="shrink-0 border-t">
            <Button
              isPending={isSubmitting}
              isDisabled={isSubmitting || !isDirty}
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
