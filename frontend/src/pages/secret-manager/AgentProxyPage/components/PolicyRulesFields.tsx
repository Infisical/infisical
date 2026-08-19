import { Control, Controller, useFieldArray, useWatch } from "react-hook-form";
import { PlusIcon, TrashIcon } from "lucide-react";

import {
  Button,
  Field,
  FieldContent,
  FieldError,
  FieldLabel,
  FilterableSelect,
  IconButton,
  Input
} from "@app/components/v3";
import { PolicyRuleMethod } from "@app/hooks/api/agentPolicies";

import { CopyRulesPopover } from "./CopyRulesPopover";

const METHOD_OPTIONS = Object.values(PolicyRuleMethod).map((method) => ({
  label: method,
  value: method
}));

// Shared by both sheets: the two rule sets are compared against the same request at runtime, so they
// have to be entered the same way.
export const PolicyRulesFields = ({
  control,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  errors,
  excludePolicyId,
  hostPatternSuggestions
}: {
  // The two sheets have different form shapes but an identical `rules` field.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  control: Control<any>;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  errors?: any;
  excludePolicyId?: string;
  // The hosts the chosen target covers, used to prefill a new rule.
  hostPatternSuggestions?: string[];
}) => {
  const rules = useFieldArray({ control, name: "rules" });
  const currentRules = useWatch({ control, name: "rules" }) as
    | { hostPattern?: string }[]
    | undefined;

  // A new rule starts on the target's own host rather than blank: the next host it covers that no rule
  // uses yet, otherwise the host of the row above, since a second rule on the same host is how you
  // narrow it by path or method.
  const nextHostPattern = () => {
    if (!hostPatternSuggestions?.length) return "";
    const used = (currentRules ?? [])
      .map((rule) => rule?.hostPattern?.trim())
      .filter((hostPattern): hostPattern is string => Boolean(hostPattern));
    const usedLower = new Set(used.map((hostPattern) => hostPattern.toLowerCase()));

    return (
      hostPatternSuggestions.find((hostPattern) => !usedLower.has(hostPattern.toLowerCase())) ??
      used[used.length - 1] ??
      hostPatternSuggestions[0]
    );
  };

  return (
    <div className="flex flex-col gap-2">
      <FieldLabel>Rules</FieldLabel>
      <div className="flex flex-col gap-3 rounded-md border border-border bg-container/50 p-4">
        <div className="flex items-center gap-2 text-xs text-label">
          <span className="flex-1">Host pattern</span>
          <span className="w-56">Method</span>
          <span className="w-8" />
        </div>
        {rules.fields.map((field, i) => (
          <div key={field.id} className="flex items-start gap-2">
            <Field className="flex-1">
              <FieldContent>
                <Controller
                  control={control}
                  name={`rules.${i}.hostPattern`}
                  render={({ field: hostField, fieldState }) => (
                    <>
                      <Input
                        {...hostField}
                        placeholder="https://api.slack.com/*"
                        isError={Boolean(fieldState.error)}
                      />
                      {fieldState.error && <FieldError>{fieldState.error.message}</FieldError>}
                    </>
                  )}
                />
              </FieldContent>
            </Field>
            <Field className="w-56">
              <FieldContent>
                <Controller
                  control={control}
                  name={`rules.${i}.methods`}
                  render={({ field: methodField }) => (
                    <FilterableSelect
                      isMulti
                      options={METHOD_OPTIONS}
                      placeholder="Any"
                      value={METHOD_OPTIONS.filter((option) =>
                        (methodField.value ?? []).includes(option.value)
                      )}
                      getOptionValue={(option) => option.value}
                      getOptionLabel={(option) => option.label}
                      onChange={(selected) =>
                        // An empty list means every method, which is what "Any" stores.
                        methodField.onChange(
                          ((selected ?? []) as readonly { value: PolicyRuleMethod }[]).map(
                            (option) => option.value
                          )
                        )
                      }
                    />
                  )}
                />
              </FieldContent>
            </Field>
            <IconButton
              aria-label="Remove rule"
              variant="ghost"
              size="sm"
              type="button"
              className="mt-[3px] hover:text-danger"
              isDisabled={rules.fields.length === 1}
              onClick={() => rules.remove(i)}
            >
              <TrashIcon />
            </IconButton>
          </div>
        ))}
        {typeof errors?.rules?.message === "string" && (
          <FieldError>{errors.rules.message}</FieldError>
        )}
      </div>
      <div className="flex items-center justify-between">
        <Button
          variant="ghost"
          size="xs"
          type="button"
          onClick={() => rules.append({ hostPattern: nextHostPattern(), methods: [] })}
        >
          <PlusIcon className="mr-1 size-4" />
          Add Rule
        </Button>
        <CopyRulesPopover excludePolicyId={excludePolicyId} onCopy={rules.replace} />
      </div>
    </div>
  );
};
