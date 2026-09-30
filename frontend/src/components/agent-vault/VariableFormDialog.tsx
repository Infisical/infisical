import { useEffect, useMemo, useState } from "react";
import { Controller, useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { EyeIcon, EyeOffIcon } from "lucide-react";
import { z } from "zod";

import { createNotification } from "@app/components/notifications";
import {
  Button,
  Checkbox,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Field,
  FieldContent,
  FieldDescription,
  FieldError,
  FieldLabel,
  Input,
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupInput,
  Label
} from "@app/components/v3";
import {
  normalizeVariableKey,
  toVariableReference,
  VARIABLE_KEY_MAX_LENGTH,
  VARIABLE_KEY_MESSAGE,
  VARIABLE_KEY_RE,
  VARIABLE_VALUE_MAX_LENGTH
} from "@app/helpers/agentVaultVariables";
import {
  useCreateAgentVaultVariable,
  useUpdateAgentVaultVariable
} from "@app/hooks/api/agentVault";
import { TAgentVaultVariable } from "@app/hooks/api/agentVault/types";

// eslint-disable-next-line no-control-regex
const NO_CONTROL_CHARS_RE = /^[^\x00-\x1f\x7f]*$/;

// A stored secret never comes back, so on edit its field starts empty and empty keeps it. A value that is
// not secret starts filled in, and emptying it is a mistake rather than a way to keep it.
const buildSchema = (takenKeys: string[], isValueRequired: boolean) =>
  z.object({
    key: z
      .string()
      .min(1, "Required")
      .max(VARIABLE_KEY_MAX_LENGTH, `A key can be at most ${VARIABLE_KEY_MAX_LENGTH} characters.`)
      .regex(VARIABLE_KEY_RE, VARIABLE_KEY_MESSAGE)
      .refine(
        (key) => !takenKeys.includes(key),
        "This bundle already has a variable with this key."
      ),
    value: z
      .string()
      .max(
        VARIABLE_VALUE_MAX_LENGTH,
        `A value can be at most ${VARIABLE_VALUE_MAX_LENGTH} characters.`
      )
      .regex(
        NO_CONTROL_CHARS_RE,
        "A value can't contain line breaks or other control characters. Check for a stray newline if you pasted it."
      )
      .refine((value) => !isValueRequired || value.length > 0, "Required")
      .refine((value) => !value || value.trim().length > 0, "A value can't be only spaces."),
    isSecret: z.boolean()
  });

type FormData = z.infer<ReturnType<typeof buildSchema>>;

type Props = {
  isOpen: boolean;
  onOpenChange: (isOpen: boolean) => void;
  accessBundleId: string;
  variable?: TAgentVaultVariable | null;
  existingKeys: string[];
  /** How many services use the variable being edited, so a rename can say they keep working. */
  usedByCount?: number;
  /** A key to start a new variable from, as when it was named in a service before it existed. */
  initialKey?: string;
  onCreated?: (variable: TAgentVaultVariable) => void;
  onCloseAutoFocus?: (event: Event) => void;
};

export const VariableFormDialog = ({
  isOpen,
  onOpenChange,
  accessBundleId,
  variable,
  existingKeys,
  usedByCount = 0,
  initialKey,
  onCreated,
  onCloseAutoFocus
}: Props) => {
  const createVariable = useCreateAgentVaultVariable();
  const updateVariable = useUpdateAgentVaultVariable();
  const isUpdate = Boolean(variable);
  const [isValueVisible, setIsValueVisible] = useState(false);

  const schema = useMemo(
    () =>
      buildSchema(
        existingKeys.filter((key) => key !== variable?.key),
        !variable || !variable.isSecret
      ),
    [existingKeys, variable]
  );

  const {
    control,
    handleSubmit,
    reset,
    setFocus,
    formState: { isDirty, isSubmitting }
  } = useForm<FormData>({ resolver: zodResolver(schema) });

  const key = useWatch({ control, name: "key" });
  const isSecret = useWatch({ control, name: "isSecret" });
  const isRenaming = Boolean(variable) && Boolean(key) && key !== variable?.key;

  useEffect(() => {
    if (!isOpen) return;
    reset({
      key: variable?.key ?? initialKey ?? "",
      value: variable && !variable.isSecret ? (variable.value ?? "") : "",
      isSecret: variable?.isSecret ?? true
    });
    setIsValueVisible(false);
  }, [isOpen, variable, initialKey, reset]);

  const onSubmit = async (data: FormData) => {
    try {
      if (variable) {
        const isValueChanged = variable.isSecret
          ? data.value.length > 0
          : data.value !== (variable.value ?? "");
        await updateVariable.mutateAsync({
          accessBundleId,
          variableId: variable.id,
          key: data.key === variable.key ? undefined : data.key,
          value: isValueChanged ? data.value : undefined,
          isSecret: data.isSecret === variable.isSecret ? undefined : data.isSecret
        });
        createNotification({ text: `Variable "${data.key}" updated`, type: "success" });
      } else {
        const created = await createVariable.mutateAsync({
          accessBundleId,
          key: data.key,
          value: data.value,
          isSecret: data.isSecret
        });
        onCreated?.(created);
        createNotification({ text: `Variable "${data.key}" created`, type: "success" });
      }
      onOpenChange(false);
    } catch {
      // A failed request returns a 4xx that the global request handler surfaces as a toast
    }
  };

  const isMasked = isSecret && !isValueVisible;

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent
        // A key that arrives filled in leaves the value as the one thing left to type.
        onOpenAutoFocus={(event) => {
          if (!initialKey) return;
          event.preventDefault();
          setFocus("value");
        }}
        onCloseAutoFocus={onCloseAutoFocus}
      >
        <DialogHeader>
          <DialogTitle>{isUpdate ? "Edit Variable" : "Add Variable"}</DialogTitle>
          <DialogDescription>
            Store a value once and use it from any service in this bundle.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-4">
          <Controller
            control={control}
            name="key"
            render={({ field, fieldState }) => (
              <Field>
                <FieldLabel>Key</FieldLabel>
                <FieldContent>
                  <Input
                    {...field}
                    onChange={(event) => field.onChange(normalizeVariableKey(event.target.value))}
                    placeholder="GITHUB_TOKEN"
                    autoComplete="off"
                    spellCheck={false}
                    className="font-mono"
                    isError={Boolean(fieldState.error)}
                  />
                  <FieldDescription>
                    {isRenaming && usedByCount > 0 ? (
                      <>
                        {usedByCount === 1
                          ? "The service that uses it keeps working"
                          : `The ${usedByCount} services that use it keep working`}{" "}
                        under the new key.
                      </>
                    ) : (
                      <>
                        Services use it as{" "}
                        <code className="font-mono">{toVariableReference(key || "KEY")}</code>.
                      </>
                    )}
                  </FieldDescription>
                  <FieldError>{fieldState.error?.message}</FieldError>
                </FieldContent>
              </Field>
            )}
          />
          <Controller
            control={control}
            name="value"
            render={({ field, fieldState }) => (
              <Field>
                <FieldLabel>Value</FieldLabel>
                <FieldContent>
                  <InputGroup>
                    <InputGroupInput
                      {...field}
                      type={isMasked ? "password" : "text"}
                      placeholder={
                        variable?.isSecret
                          ? "Leave blank to keep the current value"
                          : "Enter the value"
                      }
                      autoComplete="off"
                      spellCheck={false}
                      isError={Boolean(fieldState.error)}
                    />
                    {isSecret && (
                      <InputGroupAddon align="inline-end">
                        <InputGroupButton
                          isDisabled={!field.value}
                          aria-label={isValueVisible ? "Hide value" : "Show value"}
                          onClick={() => setIsValueVisible((prev) => !prev)}
                        >
                          {isValueVisible ? <EyeOffIcon /> : <EyeIcon />}
                        </InputGroupButton>
                      </InputGroupAddon>
                    )}
                  </InputGroup>
                  <FieldError>{fieldState.error?.message}</FieldError>
                </FieldContent>
              </Field>
            )}
          />
          <Controller
            control={control}
            name="isSecret"
            render={({ field }) => (
              <Field orientation="horizontal">
                <Checkbox
                  id="agent-vault-variable-secret"
                  variant="av"
                  isChecked={field.value}
                  onCheckedChange={(checked) => field.onChange(checked === true)}
                />
                <FieldContent>
                  <Label htmlFor="agent-vault-variable-secret">Secret</Label>
                  <FieldDescription>Hide the value after saving.</FieldDescription>
                </FieldContent>
              </Field>
            )}
          />

          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button
              type="submit"
              variant="av"
              isPending={isSubmitting}
              isDisabled={isUpdate && !isDirty}
            >
              {isUpdate ? "Save" : "Add Variable"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
};
