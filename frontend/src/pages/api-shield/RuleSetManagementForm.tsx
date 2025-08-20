import { Controller, useFieldArray, useForm, Control, FieldErrors } from "react-hook-form";
import { faMagic, faPlus, faSave, faTrash } from "@fortawesome/free-solid-svg-icons";
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
  { label: "URL", value: "uriPath" },
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
};

// Component for managing individual rules within a rule set
const RuleSetEditor = ({ ruleSetIndex, control, errors, removeRuleSet }: RuleSetEditorProps) => {
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

  return (
    <div className="space-y-2">
      <div className="mb-4 flex items-center justify-between">
        <h3 className="text-lg font-medium text-mineshaft-100">Rule Set {ruleSetIndex + 1}</h3>
        <div className="flex items-center space-x-2">
          <Button
            type="button"
            size="xs"
            variant="outline_bg"
            leftIcon={<FontAwesomeIcon icon={faPlus} />}
            onClick={addRule}
          >
            AND
          </Button>
          <IconButton
            ariaLabel="Remove rule set"
            variant="plain"
            colorSchema="danger"
            onClick={() => removeRuleSet(ruleSetIndex)}
          >
            <FontAwesomeIcon icon={faTrash} />
          </IconButton>
        </div>
      </div>
      {ruleFields.map((ruleField, ruleIndex) => (
        <div key={ruleField.id}>
          <div className="flex items-center space-x-2">
            <Controller
              control={control}
              name={`ruleSets.${ruleSetIndex}.${ruleIndex}.field`}
              render={({ field }) => (
                <FormControl
                  label={ruleIndex === 0 ? "Field" : undefined}
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
                  label={ruleIndex === 0 ? "Operator" : undefined}
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
                  label={ruleIndex === 0 ? "Value" : undefined}
                  className={twMerge("flex-1", "my-0")}
                  isError={Boolean(errors.ruleSets?.[ruleSetIndex]?.[ruleIndex]?.value)}
                  errorText={errors.ruleSets?.[ruleSetIndex]?.[ruleIndex]?.value?.message}
                >
                  <Input {...field} placeholder="Expected value" />
                </FormControl>
              )}
            />
            <IconButton
              ariaLabel="Remove rule"
              variant="plain"
              colorSchema="danger"
              onClick={() => removeRule(ruleIndex)}
              className={ruleIndex === 0 ? "relative top-2 mb-0" : "mb-0"}
            >
              <FontAwesomeIcon icon={faTrash} />
            </IconButton>
          </div>
          {ruleIndex + 1 !== ruleFields.length && (
            <div className="relative mt-2 w-min border border-mineshaft-600 px-2 py-1">
              <div className="absolute -top-2 left-1/2 h-2 w-1 bg-mineshaft-600" />
              AND
              <div className="absolute -bottom-2 left-1/2 h-2 w-1 bg-mineshaft-600" />
            </div>
          )}
        </div>
      ))}

      {ruleFields.length === 0 && (
        <div className="py-4 text-center text-sm text-mineshaft-400">
          No rules in this set. Add a rule to get started.
        </div>
      )}
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
    <div className="mb-4 flex items-center justify-between">
      <h3 className="text-lg font-medium text-mineshaft-100">Rule Set {ruleSetIndex + 1}</h3>
      <div className="text-xs text-mineshaft-400">Preview (Generated from AI)</div>
    </div>
    {rules.map((rule, ruleIndex) => (
      <div key={`preview-rule-${ruleIndex + 1}`}>
        <div className="flex items-center space-x-2">
          <FormControl
            label={ruleIndex === 0 ? "Field" : undefined}
            className={twMerge("w-40", "my-0")}
          >
            <Input
              value={FIELD_OPTIONS.find((op) => op.value === rule.field)?.label || rule.field}
              disabled
              className="bg-mineshaft-700 text-mineshaft-300"
            />
          </FormControl>
          <FormControl
            label={ruleIndex === 0 ? "Operator" : undefined}
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
            label={ruleIndex === 0 ? "Value" : undefined}
            className={twMerge("flex-1", "my-0")}
          >
            <Input value={rule.value} disabled className="bg-mineshaft-700 text-mineshaft-300" />
          </FormControl>
        </div>
        {ruleIndex + 1 !== rules.length && (
          <div className="relative mt-2 w-min border border-mineshaft-600 px-2 py-1 text-mineshaft-400">
            <div className="absolute -top-2 left-1/2 h-2 w-1 bg-mineshaft-600" />
            AND
            <div className="absolute -bottom-2 left-1/2 h-2 w-1 bg-mineshaft-600" />
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
      <div className="rounded-lg border border-mineshaft-600 bg-mineshaft-800 p-4">
        <FormLabel label="Describe your API filtering requirements" />
        <div className="mt-2 space-y-4">
          <TextArea
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            placeholder="Example: Block all POST requests to admin endpoints and filter out bot traffic..."
            rows={4}
            className="w-full resize-none"
          />

          <div className="flex items-center justify-end">
            <Button
              type="button"
              onClick={generateRules}
              isLoading={isGenerating}
              isDisabled={!prompt.trim() || isGenerating}
              leftIcon={<FontAwesomeIcon icon={faMagic} />}
            >
              {isGenerating ? "Generating Rules..." : "Generate Rules"}
            </Button>
          </div>
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
                <div className="mb-2 rounded-lg border border-mineshaft-600 bg-mineshaft-900 p-4">
                  <PreviewRuleSetEditor ruleSetIndex={ruleSetIndex} rules={ruleSet} />
                </div>
                {ruleSetIndex + 1 !== generatedRules.length && (
                  <div className="relative w-min border border-mineshaft-600 px-2 py-1 text-mineshaft-400">
                    <div className="absolute -top-2 left-1/2 h-2 w-1 bg-mineshaft-600" />
                    OR
                    <div className="absolute -bottom-2 left-1/2 h-2 w-1 bg-mineshaft-600" />
                  </div>
                )}
              </div>
            ))}
          </div>

          <div className="flex items-center justify-center space-x-4 border-t border-mineshaft-600 pt-6">
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

  const form = useForm<TFormSchema>({
    resolver: zodResolver(formSchema),
    values: bridgeDetails
      ? {
          ruleSets: bridgeDetails.ruleSet || []
        }
      : { ruleSets: [] }
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
      await updateBridge({
        id: bridgeId,
        ruleSet: data.ruleSets
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
    appendRuleSet([
      {
        field: "",
        operator: BridgeRuleOperator.EQ,
        value: ""
      }
    ]);
  };

  const handleApplyRules = (rules: TBridgeRule[][], action: "replace" | "add") => {
    if (action === "replace") {
      // Replace all existing rules with generated ones
      form.setValue("ruleSets", rules, { shouldDirty: true });
    } else {
      // Add generated rules to existing ones
      const currentRules = form.getValues("ruleSets");
      form.setValue("ruleSets", [...currentRules, ...rules], { shouldDirty: true });
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
        <FormLabel label="When incoming request match..." />
        <div className="flex items-center space-x-2">
          {isPromptMode ? (
            <Button
              type="button"
              size="xs"
              variant="outline_bg"
              leftIcon={<FontAwesomeIcon icon={faMagic} />}
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
                leftIcon={<FontAwesomeIcon icon={faPlus} />}
                onClick={addRuleSet}
              >
                OR
              </Button>
              <Button
                type="button"
                size="xs"
                variant="outline_bg"
                leftIcon={<FontAwesomeIcon icon={faMagic} />}
                onClick={() => setIsPromptMode.on()}
              >
                Prompt Mode
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
                <div className="mb-2 rounded-lg border border-mineshaft-600 bg-mineshaft-800 p-4">
                  <RuleSetEditor
                    ruleSetIndex={ruleSetIndex}
                    control={control}
                    errors={errors}
                    removeRuleSet={removeRuleSet}
                  />
                </div>
                {ruleSetIndex + 1 !== ruleSetFields.length && (
                  <div className="relative w-min border border-mineshaft-600 px-2 py-1">
                    <div className="absolute -top-2 left-1/2 h-2 w-1 bg-mineshaft-600" />
                    OR
                    <div className="absolute -bottom-2 left-1/2 h-2 w-1 bg-mineshaft-600" />
                  </div>
                )}
              </div>
            ))}
            {ruleSetFields.length === 0 && (
              <div className="rounded-lg border border-dashed border-mineshaft-600 py-8 text-center text-sm text-mineshaft-400">
                No rule sets configured. Add a rule set to get started.
              </div>
            )}
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
