import { useEffect, useMemo, useRef, useState } from "react";
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
  SheetTitle,
  Spinner
} from "@app/components/v3";
import { useProject } from "@app/context";
import {
  useCreateAgentVaultHook,
  useListAgentVaultServices,
  useUpdateAgentVaultHook
} from "@app/hooks/api/agentVault";
import { TAgentVaultHook, TAgentVaultProjectService } from "@app/hooks/api/agentVault/types";

import { HookRulesField } from "./HookRulesField";
import {
  buildCreateHookRequest,
  buildUpdateHookRequest,
  hookFormOf,
  hookFormSchema,
  isPlainHttpUrl,
  THookForm
} from "./hookSchema";

const SERVICE_PICKER_LIMIT = 100;

type Props = {
  hook?: TAgentVaultHook | null;
  isReadOnly?: boolean;
  onSaved: (hook: TAgentVaultHook) => void;
  onCancel: () => void;
  onDirtyChange?: (isDirty: boolean) => void;
  onPendingChange?: (isPending: boolean) => void;
};

const HookFormBody = ({
  hook,
  services,
  isReadOnly = false,
  onSaved,
  onCancel,
  onDirtyChange,
  onPendingChange
}: Props & { services: TAgentVaultProjectService[] }) => {
  const { projectId } = useProject();
  const createHook = useCreateAgentVaultHook(projectId);
  const updateHook = useUpdateAgentVaultHook(projectId);
  const isUpdate = Boolean(hook);
  const [isReplacingSecret, setIsReplacingSecret] = useState(false);
  const [isSecretVisible, setIsSecretVisible] = useState(false);

  const isSecretRequiredRef = useRef(!hook);
  isSecretRequiredRef.current = !hook || isReplacingSecret;
  const schema = useMemo(() => hookFormSchema(() => isSecretRequiredRef.current), []);

  const formMethods = useForm<THookForm>({
    resolver: zodResolver(schema),
    defaultValues: hookFormOf(
      hook,
      new Map(services.map((service) => [service.name, service.type]))
    )
  });
  const {
    control,
    handleSubmit,
    setValue,
    clearErrors,
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
            A server of yours that the proxy asks before it sends a session&apos;s requests. A
            session uses it only when it is created with it.
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
                    placeholder="Asks the on-call engineer before destructive calls"
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
                    {hook && !isReplacingSecret ? (
                      <div className="flex h-9 items-center gap-3 text-sm">
                        <span className="text-accent">Saved</span>
                        <Button
                          type="button"
                          variant="outline"
                          size="xs"
                          onClick={() => setIsReplacingSecret(true)}
                        >
                          Replace
                        </Button>
                      </div>
                    ) : (
                      <InputGroup>
                        <InputGroupInput
                          {...field}
                          id="agent-vault-hook-secret"
                          type={isSecretVisible ? "text" : "password"}
                          placeholder="At least 32 characters"
                          autoComplete="new-password"
                          spellCheck={false}
                          isError={Boolean(fieldState.error)}
                        />
                        <InputGroupAddon align="inline-end">
                          <InputGroupButton
                            isDisabled={!field.value}
                            aria-label={isSecretVisible ? "Hide secret" : "Show secret"}
                            onClick={() => setIsSecretVisible((prev) => !prev)}
                          >
                            {isSecretVisible ? <EyeOffIcon /> : <EyeIcon />}
                          </InputGroupButton>
                        </InputGroupAddon>
                      </InputGroup>
                    )}
                    <FieldDescription>
                      {hook && isReplacingSecret ? (
                        <>
                          Proxies switch to the new secret on their next check-in.{" "}
                          <button
                            type="button"
                            className="underline underline-offset-2 hover:text-foreground"
                            onClick={() => {
                              setIsReplacingSecret(false);
                              setValue("secret", "", { shouldDirty: true });
                              clearErrors("secret");
                            }}
                          >
                            Keep the saved one
                          </button>
                        </>
                      ) : (
                        "Signs each check the proxy sends, so your server can verify it. It is never shown again."
                      )}
                    </FieldDescription>
                    <FieldError>{fieldState.error?.message}</FieldError>
                  </FieldContent>
                </Field>
              )}
            />
          )}
          <HookRulesField services={services} isDisabled={isReadOnly} />
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

/** Header, body and footer of the hook sheet, to go inside a `SheetContent`. */
export const HookForm = (props: Props) => {
  const { projectId } = useProject();
  // Rules name services, so the picker lists the project's and a saved rule takes its service's type from it. A rule
  // can also name one that isn't listed, such as an inline service.
  const { data: servicePage, isPending } = useListAgentVaultServices(projectId, {
    orderBy: "name",
    orderDirection: "asc",
    limit: SERVICE_PICKER_LIMIT
  });

  if (isPending) {
    return (
      <div className="flex flex-1 items-center justify-center">
        <Spinner size="sm" variant="av" />
      </div>
    );
  }
  return <HookFormBody {...props} services={servicePage?.services ?? []} />;
};
