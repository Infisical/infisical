import { Controller, useFieldArray, useForm, Control, FieldErrors } from "react-hook-form";
import {
  faMagic,
  faMagicWandSparkles,
  faPlus,
  faRightFromBracket,
  faSave,
  faTrash,
  faWandMagicSparkles
} from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { zodResolver } from "@hookform/resolvers/zod";
import { twMerge } from "tailwind-merge";
import { z } from "zod";

import { createNotification } from "@app/components/notifications";
import {
  Button,
  FormControl,
  FormLabel,
  IconButton,
  Input,
  Select,
  SelectItem,
  TextArea
} from "@app/components/v2";
import {
  BridgeRuleOperator,
  TBridgeRule,
  bridgeQueryKeys,
  useUpdateBridge
} from "@app/hooks/api/bridge";
import { useQuery } from "@tanstack/react-query";
import { useToggle } from "@app/hooks";
import { useState } from "react";
import { useGenerateBridgeRules } from "@app/hooks/api/bridge/mutation";

const ruleSchema = z.object({
  field: z.string().min(1, "Field is required"),
  operator: z.nativeEnum(BridgeRuleOperator),
  value: z.string().min(1, "Value is required")
});

const ruleSetSchema = z.array(ruleSchema);

const formSchema = z.object({
  ruleSets: z.array(ruleSetSchema).default([])
});

type TFormSchema = z.infer<typeof formSchema>;

type Props = {
  bridgeId: string;
  onSuccess?: () => void;
};

const FIELD_OPTIONS = [
  { label: "Request Method", value: "requestMethod" },
  { label: "URI Path", value: "uriPath" },
  { label: "User Agent", value: "userAgent" },
  { label: "IP", value: "ip" },
  { label: "Query String", value: "queryString" },
  { label: "Role", value: "role" }
];

const OPERATOR_OPTIONS = [
  { label: "Equal", value: BridgeRuleOperator.EQ },
  { label: "Not Equals", value: BridgeRuleOperator.NEQ },
  { label: "Contains", value: BridgeRuleOperator.CONTAINS },
  { label: "Not Contains", value: BridgeRuleOperator.NOT_CONTAINS },
  { label: "Ends With", value: BridgeRuleOperator.ENDS_WITH },
  { label: "Not Ends With", value: BridgeRuleOperator.NOT_ENDS_WITH },
  { label: "Starts With", value: BridgeRuleOperator.STARTS_WITH },
  { label: "Not Starts With", value: BridgeRuleOperator.NOT_STARTS_WITH },
  { label: "Is In", value: BridgeRuleOperator.IN },
  { label: "Wildcard", value: BridgeRuleOperator.WILDCARD }
];

type RuleSetEditorProps = {
  ruleSetIndex: number;
  control: Control<TFormSchema>;
  errors: FieldErrors<TFormSchema>;
  removeRuleSet: (index: number) => void;
  totalRuleSets: number; // Added to know if it's the last OR block
  defaultRule: TBridgeRule; // Added for resetting the last rule
};

// Component for managing individual rules within a rule set
const RuleSetEditor = ({
  ruleSetIndex,
  control,
  errors,
  removeRuleSet,
  totalRuleSets,
  defaultRule
}: RuleSetEditorProps) => {
  const {
    fields: ruleFields,
    append: appendRule,
    remove: removeRule
  } = useFieldArray({
    control,
    name: `ruleSets.${ruleSetIndex}`
  });

  const addRule = () => {
    appendRule({
      field: "requestMethod",
      operator: BridgeRuleOperator.EQ,
      value: ""
    });
  };

  const handleRemoveRule = (index: number) => {
    if (ruleFields.length === 1) {
      // This is the last rule (AND array) in the current rule set (OR block)
      if (totalRuleSets === 1) {
        // This is the last rule in the last rule set (last AND array in the last OR block)
        // Reset the rule to default instead of deleting the rule set
        control.setValue(`ruleSets.${ruleSetIndex}.0`, defaultRule, { shouldDirty: true });
        createNotification({
          type: "info",
          text: "Cannot delete the last rule in the last rule set. Resetting to default."
        });
      } else {
        // This is the last rule in a rule set, but there are other rule sets.
        // Delete the entire rule set (OR block).
        removeRuleSet(ruleSetIndex);
      }
    } else {
      // Not the last rule, just remove it
      removeRule(index);
    }
  };

  return (
    <div className="space-y-2">
      {ruleFields.map((ruleField, ruleIndex) => (
        <div key={ruleField.id}>
          <div className="flex items-end space-x-2">
            <Controller
              control={control}
              name={`ruleSets.${ruleSetIndex}.${ruleIndex}.field`}
              render={({ field }) => (
                <FormControl
                  label={ruleSetIndex === 0 && ruleIndex === 0 ? "Field" : undefined}
                  className={twMerge("w-40", "my-0")}
                  isError={Boolean(errors.ruleSets?.[ruleSetIndex]?.[ruleIndex]?.field)}
                  errorText={errors.ruleSets?.[ruleSetIndex]?.[ruleIndex]?.field?.message}
                >
                  <Select {...field} onValueChange={(el) => field.onChange(el)} className="w-full">
                    {FIELD_OPTIONS.map((option) => (
                      <SelectItem key={option.value} value={option.value}>
                        {option.label}
                      </SelectItem>
                    ))}
                  </Select>
                </FormControl>
              )}
            />

            <Controller
              control={control}
              name={`ruleSets.${ruleSetIndex}.${ruleIndex}.operator`}
              render={({ field }) => (
                <FormControl
                  label={ruleSetIndex === 0 && ruleIndex === 0 ? "Operator" : undefined}
                  className={twMerge("w-40", "my-0")}
                  isError={Boolean(errors.ruleSets?.[ruleSetIndex]?.[ruleIndex]?.operator)}
                  errorText={errors.ruleSets?.[ruleSetIndex]?.[ruleIndex]?.operator?.message}
                >
                  <Select {...field} onValueChange={(el) => field.onChange(el)} className="w-full">
                    {OPERATOR_OPTIONS.map((option) => (
                      <SelectItem key={option.value} value={option.value}>
                        {option.label}
                      </SelectItem>
                    ))}
                  </Select>
                </FormControl>
              )}
            />

            <Controller
              control={control}
              name={`ruleSets.${ruleSetIndex}.${ruleIndex}.value`}
              render={({ field }) => (
                <FormControl
                  label={ruleSetIndex === 0 && ruleIndex === 0 ? "Value" : undefined}
                  className={twMerge("flex-1", "my-0")}
                  isError={Boolean(errors.ruleSets?.[ruleSetIndex]?.[ruleIndex]?.value)}
                  errorText={errors.ruleSets?.[ruleSetIndex]?.[ruleIndex]?.value?.message}
                >
                  <Input {...field} placeholder="Expected value" />
                </FormControl>
              )}
            />
            <Button
              type="button"
              size="xs"
              className="m-0 h-9 px-3"
              variant="outline_bg"
              onClick={addRule}
            >
              And
            </Button>
            <IconButton
              ariaLabel="Remove rule"
              variant="plain"
              colorSchema="danger"
              onClick={() => handleRemoveRule(ruleIndex)} // Changed to use handleRemoveRule
              className="m-0 h-9 pl-2"
            >
              <FontAwesomeIcon icon={faTrash} />
            </IconButton>
          </div>
          {ruleIndex + 1 !== ruleFields.length && (
            <div className="relative ml-2 mt-2 w-min rounded bg-mineshaft-600 px-2 py-1 text-xs text-mineshaft-300">
              <div className="absolute -top-2 right-1/2 h-2 w-1 translate-x-1/2 bg-mineshaft-600" />
              And
              <div className="absolute -bottom-2 right-1/2 h-2 w-1 translate-x-1/2 bg-mineshaft-600" />
            </div>
          )}
        </div>
      ))}
    </div>
  );
};

type PromptModeProps = {
  onApplyRules: (rules: TBridgeRule[][], action: "replace" | "add") => void;
  bridgeId: string;
};

const PreviewRuleSetEditor = ({
  ruleSetIndex,
  rules
}: {
  ruleSetIndex: number;
  rules: TBridgeRule[];
}) => (
  <div className="space-y-2 opacity-75">
    {rules.map((rule, ruleIndex) => (
      <div key={`preview-rule-${ruleIndex + 1}`}>
        <div className="flex items-center space-x-2">
          <FormControl
            label={ruleIndex === 0 && ruleSetIndex == 0 ? "Field" : undefined}
            className={twMerge("w-40", "my-0")}
          >
            <Input
              value={FIELD_OPTIONS.find((op) => op.value === rule.field)?.label || rule.field}
              disabled
              className="bg-mineshaft-700 text-mineshaft-300"
            />
          </FormControl>
          <FormControl
            label={ruleIndex === 0 && ruleSetIndex == 0 ? "Operator" : undefined}
            className={twMerge("w-40", "my-0")}
          >
            <Input
              value={
                OPERATOR_OPTIONS.find((op) => op.value === rule.operator)?.label || rule.operator
              }
              disabled
              className="bg-mineshaft-700 text-mineshaft-300"
            />
          </FormControl>
          <FormControl
            label={ruleIndex === 0 && ruleSetIndex == 0 ? "Value" : undefined}
            className={twMerge("flex-1", "my-0")}
          >
            <Input value={rule.value} disabled className="bg-mineshaft-700 text-mineshaft-300" />
          </FormControl>
        </div>
        {ruleIndex + 1 !== rules.length && (
          <div className="relative ml-2 mt-2 w-min rounded bg-mineshaft-600 px-2 py-1 text-xs text-mineshaft-300">
            <div className="absolute -top-2 right-1/2 h-2 w-1 translate-x-1/2 bg-mineshaft-600" />
            And
            <div className="absolute -bottom-2 right-1/2 h-2 w-1 translate-x-1/2 bg-mineshaft-600" />
          </div>
        )}
      </div>
    ))}
  </div>
);

// Component for AI-powered rule generation from natural language prompts
const PromptMode = ({ onApplyRules, bridgeId }: PromptModeProps) => {
  const [prompt, setPrompt] = useState("");
  const [generatedRules, setGeneratedRules] = useState<TBridgeRule[][]>([]);
  const [isGenerating, setIsGenerating] = useState(false);
  const [hasGenerated, setHasGenerated] = useState(false);
  const { mutateAsync: generateRulesByPrompt } = useGenerateBridgeRules();

  const generateRules = async () => {
    if (!prompt.trim()) return;

    setIsGenerating(true);
    try {
      const data = await generateRulesByPrompt({
        prompt,
        bridgeId
      });
      setGeneratedRules(data.data);
      setHasGenerated(true);

      createNotification({
        type: "success",
        text: "Rules generated successfully from prompt!"
      });
    } catch (err) {
      console.error(err);
      createNotification({
        type: "error",
        text: "Failed to generate rules from prompt"
      });
    } finally {
      setIsGenerating(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="mt-2 space-y-4">
        <TextArea
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          placeholder="Only allow POST requests from admins..."
          rows={4}
          className="w-full resize-none"
        />

        <div className="flex items-center justify-end">
          <Button
            type="button"
            onClick={generateRules}
            isLoading={isGenerating}
            isDisabled={!prompt.trim() || isGenerating}
            leftIcon={<FontAwesomeIcon icon={faMagicWandSparkles} />}
          >
            {isGenerating ? "Generating Rules..." : "Generate Rules"}
          </Button>
        </div>
      </div>

      {hasGenerated && generatedRules.length > 0 && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-lg font-medium text-mineshaft-100">Generated Rules Preview</h3>
            <div className="text-sm text-mineshaft-400">
              {generatedRules.length} rule set{generatedRules.length > 1 ? "s" : ""} generated
            </div>
          </div>

          <div className="space-y-2">
            {generatedRules.map((ruleSet, ruleSetIndex) => (
              <div key={`gen-rule-${ruleSetIndex + 1}`}>
                <div className="mb-2">
                  <PreviewRuleSetEditor ruleSetIndex={ruleSetIndex} rules={ruleSet} />
                </div>
                {ruleSetIndex + 1 !== generatedRules.length && (
                  <div className="relative ml-2 mt-2 w-min rounded bg-mineshaft-600 px-2 py-1 text-xs text-mineshaft-300">
                    Or
                  </div>
                )}
              </div>
            ))}
          </div>

          <div className="flex items-center justify-center space-x-4 pt-2">
            <Button
              type="button"
              variant="outline_bg"
              onClick={() => onApplyRules(generatedRules, "replace")}
            >
              Replace Existing Rules
            </Button>
            <Button
              type="button"
              variant="outline_bg"
              onClick={() => onApplyRules(generatedRules, "add")}
            >
              Add to Existing Rules
            </Button>
          </div>
        </div>
      )}
    </div>
  );
};

export const RuleSetManagementForm = ({ bridgeId, onSuccess }: Props) => {
  const { data: bridgeDetails, isPending } = useQuery({
    ...bridgeQueryKeys.byId(bridgeId),
    enabled: Boolean(bridgeId)
  });

  const [isPromptMode, setIsPromptMode] = useToggle();

  const DEFAULT_RULE = {
    field: "uriPath",
    operator: BridgeRuleOperator.EQ,
    value: ""
  };
  const DEFAULT_RULE_SET: TBridgeRule[] = [DEFAULT_RULE];

  const form = useForm<TFormSchema>({
    resolver: zodResolver(formSchema),
    values: (() => {
      const initialRuleSets = bridgeDetails?.ruleSet;
      // Ensure there's always at least one rule set with one default rule
      if (!initialRuleSets || initialRuleSets.length === 0) {
        return { ruleSets: [DEFAULT_RULE_SET] };
      }
      // Ensure all initial rule sets have at least one rule
      const validatedInitialRuleSets = initialRuleSets.map((ruleSet) =>
        ruleSet.length > 0 ? ruleSet : DEFAULT_RULE_SET
      );
      return { ruleSets: validatedInitialRuleSets };
    })()
  });

  const {
    control,
    handleSubmit,
    formState: { isDirty, isSubmitting, errors }
  } = form;

  const {
    fields: ruleSetFields,
    append: appendRuleSet,
    remove: removeRuleSet
  } = useFieldArray({
    control,
    name: "ruleSets"
  });

  const { mutateAsync: updateBridge } = useUpdateBridge();

  const onSubmit = async (data: TFormSchema) => {
    try {
      // Filter out any potentially empty rule sets before sending (though our logic should prevent this)
      const cleanedRuleSets = data.ruleSets.filter((ruleSet) => ruleSet.length > 0);
      // Ensure at least one rule set is always sent, even if filtered to empty
      const finalRuleSets = cleanedRuleSets.length > 0 ? cleanedRuleSets : [DEFAULT_RULE_SET];

      await updateBridge({
        id: bridgeId,
        ruleSet: finalRuleSets
      });

      createNotification({
        type: "success",
        text: "Rule sets updated successfully"
      });

      onSuccess?.();
    } catch (err) {
      console.error(err);
      createNotification({
        type: "error",
        text: "Failed to update rule sets"
      });
    }
  };

  const addRuleSet = () => {
    // When an OR block is created, populate it with a default AND array (one rule)
    // Changed to explicitly use DEFAULT_RULE_SET for clarity, though [DEFAULT_RULE] is functionally identical
    appendRuleSet([DEFAULT_RULE_SET]);
  };

  const handleApplyRules = (rules: TBridgeRule[][], action: "replace" | "add") => {
    if (action === "replace") {
      // Replace all existing rules with generated ones, ensuring at least one rule set and each rule set has at least one rule
      const newRules =
        rules.length > 0
          ? rules.map((rs) => (rs.length > 0 ? rs : DEFAULT_RULE_SET))
          : [DEFAULT_RULE_SET];
      form.setValue("ruleSets", newRules, {
        shouldDirty: true
      });
    } else {
      // Add generated rules to existing ones, ensuring each new rule set has at least one rule
      const currentRules = form.getValues("ruleSets");
      const newRulesToAdd = rules.map((rs) => (rs.length > 0 ? rs : DEFAULT_RULE_SET));
      form.setValue("ruleSets", [...currentRules, ...newRulesToAdd], { shouldDirty: true });
    }

    // Exit prompt mode after applying rules
    setIsPromptMode.off();

    createNotification({
      type: "success",
      text: `Rules ${action === "replace" ? "replaced" : "added"} successfully!`
    });
  };

  if (isPending) {
    return <div>Loading...</div>;
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="w-full space-y-3">
      <div className="flex items-center justify-between">
        <FormLabel
          label={
            isPromptMode
              ? "Allow incoming requests that match the following query"
              : "Allow incoming requests that match..."
          }
        />
        <div className="flex items-center space-x-2">
          {isPromptMode ? (
            <Button
              type="button"
              size="xs"
              variant="outline_bg"
              leftIcon={<FontAwesomeIcon icon={faRightFromBracket} />}
              onClick={() => setIsPromptMode.off()}
            >
              Exit Prompt Mode
            </Button>
          ) : (
            <>
              <Button
                type="button"
                size="xs"
                variant="outline_bg"
                className="px-3"
                onClick={addRuleSet}
              >
                Or
              </Button>
              <Button
                type="button"
                size="xs"
                variant="outline_bg"
                leftIcon={<FontAwesomeIcon icon={faWandMagicSparkles} />}
                onClick={() => setIsPromptMode.on()}
              >
                Generate With Prompt
              </Button>
            </>
          )}
        </div>
      </div>
      {isPromptMode ? (
        <PromptMode bridgeId={bridgeId} onApplyRules={handleApplyRules} />
      ) : (
        <>
          <div className="space-y-2">
            {ruleSetFields.map((ruleSetField, ruleSetIndex) => (
              <div key={ruleSetField.id}>
                <div className="mb-2">
                  <RuleSetEditor
                    ruleSetIndex={ruleSetIndex}
                    control={control}
                    errors={errors}
                    removeRuleSet={removeRuleSet}
                    totalRuleSets={ruleSetFields.length} // Pass the total number of OR blocks
                    defaultRule={DEFAULT_RULE} // Pass the default rule for resetting
                  />
                </div>
                {ruleSetIndex + 1 !== ruleSetFields.length && (
                  <div className="relative ml-2 mt-2 w-min rounded bg-mineshaft-600 px-2 py-1 text-xs text-mineshaft-300">
                    Or
                  </div>
                )}
              </div>
            ))}
          </div>
          <div className="flex items-center justify-end space-x-4 border-t border-mineshaft-600 pt-6">
            <Button
              type="submit"
              variant="outline_bg"
              className={twMerge("border border-primary", isDirty && "bg-primary text-black")}
              isDisabled={!isDirty || isSubmitting}
              isLoading={isSubmitting}
              leftIcon={<FontAwesomeIcon icon={faSave} />}
            >
              Update Rules
            </Button>
          </div>
        </>
      )}
    </form>
  );
};
