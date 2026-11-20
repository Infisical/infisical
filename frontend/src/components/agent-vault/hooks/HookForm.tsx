import { useEffect, useMemo, useState } from "react";
import { Controller, FormProvider, useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { EyeIcon, EyeOffIcon } from "lucide-react";

import { createNotification } from "@app/components/notifications";
import {
  Button,
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
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle
} from "@app/components/v3";
import { cn } from "@app/components/v3/utils";
import { useProject } from "@app/context";
import { useCreateAgentVaultHook, useUpdateAgentVaultHook } from "@app/hooks/api/agentVault";
import { TAgentVaultHook } from "@app/hooks/api/agentVault/types";

import { UNCHANGED_SECRET } from "../service-sheet/serviceSchema";
import {
  buildCreateHookRequest,
  buildUpdateHookRequest,
  hookFormOf,
  hookFormSchema,
  isPlainHttpUrl,
  THookForm
} from "./hookSchema";

type Props = {
  hook?: TAgentVaultHook | null;
  /** Prefills Name on create, such as what was typed into the picker that opened the form. */
  initialName?: string;
  isReadOnly?: boolean;
  onSaved: (hook: TAgentVaultHook) => void;
  onCancel: () => void;
  onDirtyChange?: (isDirty: boolean) => void;
  onPendingChange?: (isPending: boolean) => void;
};

/** Header, body and footer of the hook sheet, to go inside a `SheetContent`. */
export const HookForm = ({
  hook,
  initialName,
  isReadOnly = false,
  onSaved,
  onCancel,
  onDirtyChange,
  onPendingChange
}: Props) => {
  const { projectId } = useProject();
  const createHook = useCreateAgentVaultHook(projectId);
  const updateHook = useUpdateAgentVaultHook(projectId);
  const isUpdate = Boolean(hook);
  const [isSecretVisible, setIsSecretVisible] = useState(false);
  const schema = useMemo(() => hookFormSchema(), []);

  const formMethods = useForm<THookForm>({
    resolver: zodResolver(schema),
    defaultValues: hookFormOf(hook, initialName)
  });
  const {
    control,
    handleSubmit,
    formState: { isDirty, isSubmitting }
  } = formMethods;
  const url = useWatch({ control, name: "url" });

  useEffect(() => onDirtyChange?.(isDirty), [isDirty]);
  useEffect(() => onPendingChange?.(isSubmitting), [isSubmitting]);

  const onSubmit = async (data: THookForm) => {
    try {
      const saved = hook
        ? await updateHook.mutateAsync({
            hookId: hook.id,
            ...buildUpdateHookRequest(hook, data)
          })
        : await createHook.mutateAsync(buildCreateHookRequest(data));
      createNotification({
        text: `Hook "${saved.name}" ${hook ? "updated" : "created"}`,
        type: "success"
      });
      onSaved(saved);
    } catch {
      // The global request handler reports the failure, and the form stays open to fix it.
    }
  };

  let title = "Create Hook";
  if (isReadOnly) title = hook?.name ?? "Hook";
  else if (hook) title = "Edit Hook";

  return (
    <FormProvider {...formMethods}>
      <form onSubmit={handleSubmit(onSubmit)} className="flex min-h-0 flex-1 flex-col">
        <SheetHeader>
          <SheetTitle>{title}</SheetTitle>
          <SheetDescription>
            A server of yours that the proxy asks before it sends a request. Pick it on a service to
            check that service&apos;s requests.
          </SheetDescription>
        </SheetHeader>

        <div className="flex min-h-0 thin-scrollbar flex-1 flex-col gap-5 overflow-y-auto p-4">
          <Controller
            control={control}
            name="name"
            render={({ field, fieldState }) => (
              <Field>
                <FieldLabel htmlFor="agent-vault-hook-name">Name</FieldLabel>
                <FieldContent>
                  <Input
                    {...field}
                    id="agent-vault-hook-name"
                    placeholder="approvals"
                    autoComplete="off"
                    spellCheck={false}
                    disabled={isReadOnly}
                    isError={Boolean(fieldState.error)}
                  />
                  <FieldError>{fieldState.error?.message}</FieldError>
                </FieldContent>
              </Field>
            )}
          />
          <Controller
            control={control}
            name="description"
            render={({ field, fieldState }) => (
              <Field>
                <FieldLabel htmlFor="agent-vault-hook-description">
                  Description <span className="text-muted">(optional)</span>
                </FieldLabel>
                <FieldContent>
                  <Input
                    {...field}
                    id="agent-vault-hook-description"
                    placeholder={
                      isReadOnly
                        ? "No description"
                        : "Asks the on-call engineer before destructive calls"
                    }
                    disabled={isReadOnly}
                    isError={Boolean(fieldState.error)}
                  />
                  <FieldError>{fieldState.error?.message}</FieldError>
                </FieldContent>
              </Field>
            )}
          />
          <Controller
            control={control}
            name="url"
            render={({ field, fieldState }) => (
              <Field>
                <FieldLabel htmlFor="agent-vault-hook-url">URL</FieldLabel>
                <FieldContent>
                  <Input
                    {...field}
                    id="agent-vault-hook-url"
                    placeholder="https://hooks.example.com/agent-vault"
                    autoComplete="off"
                    spellCheck={false}
                    disabled={isReadOnly}
                    isError={Boolean(fieldState.error)}
                  />
                  {isPlainHttpUrl(url) && (
                    <FieldDescription>
                      Requests and answers are sent unencrypted over http://.
                    </FieldDescription>
                  )}
                  <FieldError>{fieldState.error?.message}</FieldError>
                </FieldContent>
              </Field>
            )}
          />
          {!isReadOnly && (
            <Controller
              control={control}
              name="secret"
              render={({ field, fieldState }) => (
                <Field>
                  <FieldLabel htmlFor="agent-vault-hook-secret">Secret</FieldLabel>
                  <FieldContent>
                    <InputGroup>
                      <InputGroupInput
                        {...field}
                        id="agent-vault-hook-secret"
                        placeholder="At least 32 characters"
                        // Not type="password", so password managers don't offer to fill it; masked in CSS as the
                        // service credential fields are, which also keeps the saved-secret sentinel unreadable.
                        className={cn(
                          (!isSecretVisible || field.value === UNCHANGED_SECRET) &&
                            "[-webkit-text-security:disc]"
                        )}
                        autoComplete="off"
                        spellCheck={false}
                        data-1p-ignore
                        data-lpignore="true"
                        data-bwignore
                        isError={Boolean(fieldState.error)}
                        onFocus={() => {
                          if (field.value === UNCHANGED_SECRET) field.onChange("");
                        }}
                        // Left empty, the saved secret stays: clicking in must not discard it.
                        onBlur={() => {
                          if (hook && !field.value) field.onChange(UNCHANGED_SECRET);
                          field.onBlur();
                        }}
                      />
                      {field.value !== UNCHANGED_SECRET && (
                        <InputGroupAddon align="inline-end">
                          <InputGroupButton
                            isDisabled={!field.value}
                            aria-label={isSecretVisible ? "Hide secret" : "Show secret"}
                            onClick={() => setIsSecretVisible((prev) => !prev)}
                          >
                            {isSecretVisible ? <EyeOffIcon /> : <EyeIcon />}
                          </InputGroupButton>
                        </InputGroupAddon>
                      )}
                    </InputGroup>
                    <FieldDescription>
                      {hook
                        ? "Type a new secret to replace the saved one. Proxies switch to it on their next check-in."
                        : "Signs each check the proxy sends, so your server can verify it. It is never shown again."}
                    </FieldDescription>
                    <FieldError>{fieldState.error?.message}</FieldError>
                  </FieldContent>
                </Field>
              )}
            />
          )}
        </div>

        <SheetFooter className="justify-end border-t">
          {isReadOnly ? (
            <Button type="button" variant="outline" onClick={onCancel}>
              Close
            </Button>
          ) : (
            <>
              <Button type="button" variant="ghost" onClick={onCancel} isDisabled={isSubmitting}>
                Cancel
              </Button>
              <Button
                type="submit"
                variant="av"
                isPending={isSubmitting}
                isDisabled={isUpdate && !isDirty}
              >
                {isUpdate ? "Save" : "Create Hook"}
              </Button>
            </>
          )}
        </SheetFooter>
      </form>
    </FormProvider>
  );
};
