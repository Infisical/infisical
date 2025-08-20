import { Controller, useFieldArray, useForm, Control, FieldErrors } from "react-hook-form";
import { faPlus, faSave, faTrash } from "@fortawesome/free-solid-svg-icons";
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
  SelectItem
} from "@app/components/v2";
import { BridgeRuleOperator, bridgeQueryKeys, useUpdateBridge } from "@app/hooks/api/bridge";
import { useQuery } from "@tanstack/react-query";

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
  onCancel?: () => void;
};

const FIELD_OPTIONS = [
  { label: "Request Method", value: "requestMethod" },
  { label: "URL", value: "uriPath" },
  { label: "User Agent", value: "userAgent" },
  { label: "IP", value: "ip" },
  { label: "Query String", value: "queryString" },
  { label: "URL", value: "uriPath" },
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
      field: "url",
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
              OR
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

export const RuleSetManagementForm = ({ bridgeId, onSuccess, onCancel }: Props) => {
  const { data: bridgeDetails, isPending } = useQuery({
    ...bridgeQueryKeys.byId(bridgeId),
    enabled: Boolean(bridgeId)
  });

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

  if (isPending) {
    return <div>Loading...</div>;
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="w-full space-y-6">
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <FormLabel label="When incoming request match..." />
          <Button
            type="button"
            size="xs"
            variant="outline_bg"
            leftIcon={<FontAwesomeIcon icon={faPlus} />}
            onClick={addRuleSet}
          >
            OR
          </Button>
        </div>
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
        {onCancel && (
          <Button type="button" variant="plain" onClick={onCancel} isDisabled={isSubmitting}>
            Cancel
          </Button>
        )}
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
    </form>
  );
};
