import { useEffect, useMemo } from "react";
import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";

import { createNotification } from "@app/components/notifications";
import {
  Button,
  Field,
  FieldContent,
  FieldDescription,
  FieldError,
  FieldLabel,
  FilterableSelect,
  Input,
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle
} from "@app/components/v3";
import { useProject } from "@app/context";
import {
  PolicyRuleMethod,
  TAgentPolicy,
  useCreateAgentPolicy,
  useGetAgentPolicyTargets,
  useUpdateAgentPolicy
} from "@app/hooks/api/agentPolicies";
import { useSearchOrgIdentityMemberships } from "@app/hooks/api/identities";
import { SearchIdentitiesScope } from "@app/hooks/api/identities/types";

import { PolicyRulesFields } from "./PolicyRulesFields";
import { findPolicyTemplate } from "./PolicyTargetCell";
import { SecretPickerPopover } from "./SecretPickerPopover";

const schema = z.object({
  name: z
    .string()
    .trim()
    .min(1, "Required")
    .max(64)
    .regex(/^[a-z0-9-]+$/, "Use lowercase letters, numbers and dashes"),
  target: z.object({ key: z.string(), label: z.string() }, { required_error: "Required" }),
  agents: z
    .object({ identityId: z.string(), name: z.string() })
    .array()
    .min(1, "Select at least one agent"),
  credentials: z
    .object({
      slotKey: z.string(),
      label: z.string(),
      environment: z.object({ slug: z.string(), name: z.string() }, { required_error: "Required" }),
      secretPath: z.string().trim().min(1),
      secretKey: z.string().trim().min(1, "Required")
    })
    .array(),
  rules: z
    .object({
      hostPattern: z.string().trim().min(1, "Required"),
      methods: z.nativeEnum(PolicyRuleMethod).array()
    })
    .array()
    .min(1, "Add at least one rule")
});

type TForm = z.infer<typeof schema>;

type Props = {
  isOpen: boolean;
  policy?: TAgentPolicy;
  onOpenChange: (isOpen: boolean) => void;
};

export const AgentPolicySheet = ({ isOpen, policy, onOpenChange }: Props) => {
  const { projectId, currentProject } = useProject();
  const isEdit = Boolean(policy);

  const { data: targets } = useGetAgentPolicyTargets();
  // Agents are org-level, and only those explicitly marked as agents may appear here.
  const { data: identityData } = useSearchOrgIdentityMemberships({
    orgId: currentProject.orgId,
    limit: 200,
    offset: 0,
    scope: [SearchIdentitiesScope.OrganizationScope],
    search: {}
  });

  const createPolicy = useCreateAgentPolicy();
  const updatePolicy = useUpdateAgentPolicy();

  const agentOptions = useMemo(
    () =>
      (identityData?.identities ?? [])
        .filter((membership) => membership.identity.isAgent)
        .map((membership) => ({
          identityId: membership.identity.id,
          name: membership.identity.name
        })),
    [identityData]
  );

  const targetOptions = useMemo(
    () =>
      (targets ?? []).map((target) => ({
        key: target.key,
        label: findPolicyTemplate(target.key)?.name ?? target.key
      })),
    [targets]
  );

  const environmentOptions = currentProject.environments.map((env) => ({
    slug: env.slug,
    name: env.name
  }));

  const {
    control,
    handleSubmit,
    reset,
    watch,
    setValue,
    formState: { isSubmitting, errors }
  } = useForm<TForm>({
    resolver: zodResolver(schema),
    defaultValues: {
      name: "",
      agents: [],
      credentials: [],
      rules: [{ hostPattern: "", methods: [] }]
    }
  });

  const selectedTarget = watch("target");
  const credentials = watch("credentials");

  // The target decides which credential slots exist and seeds the rules, so picking one rewrites both.
  // On edit the target is fixed, so this only ever runs for a fresh policy.
  useEffect(() => {
    if (isEdit || !selectedTarget) return;
    const target = targets?.find((t) => t.key === selectedTarget.key);
    if (!target) return;

    setValue(
      "credentials",
      target.credentials.map((slot) => ({
        slotKey: slot.slotKey,
        label: slot.label,
        environment: environmentOptions[0],
        secretPath: "/",
        secretKey: ""
      }))
    );
    setValue(
      "rules",
      target.defaultRules.length
        ? target.defaultRules.map((rule) => ({
            hostPattern: rule.hostPattern,
            methods: rule.methods
          }))
        : [{ hostPattern: "", methods: [] }]
    );
  }, [selectedTarget?.key, targets, isEdit]);

  useEffect(() => {
    if (!isOpen) return;

    if (policy) {
      reset({
        name: policy.name,
        target: {
          key: policy.target,
          label: findPolicyTemplate(policy.target)?.name ?? policy.target
        },
        agents: policy.agents.map((agent) => ({ identityId: agent.identityId, name: agent.name })),
        credentials: policy.credentials.map((credential) => ({
          slotKey: credential.slotKey,
          label: credential.slotKey,
          environment:
            environmentOptions.find((env) => env.slug === credential.environment) ??
            environmentOptions[0],
          secretPath: credential.secretPath,
          secretKey: credential.secretKey
        })),
        rules: policy.rules.map((rule) => ({
          hostPattern: rule.hostPattern,
          methods: rule.methods
        }))
      });
    } else {
      reset({
        name: "",
        agents: [],
        credentials: [],
        rules: [{ hostPattern: "", methods: [] }]
      });
    }
  }, [isOpen, policy]);

  const onSubmit = async (form: TForm) => {
    const payload = {
      identityIds: form.agents.map((agent) => agent.identityId),
      credentials: form.credentials.map((credential) => ({
        slotKey: credential.slotKey,
        environment: credential.environment.slug,
        secretPath: credential.secretPath,
        secretKey: credential.secretKey
      })),
      rules: form.rules
    };

    try {
      if (policy) {
        await updatePolicy.mutateAsync({
          policyId: policy.id,
          projectId,
          name: form.name,
          ...payload
        });
      } else {
        await createPolicy.mutateAsync({
          projectId,
          name: form.name,
          target: form.target.key,
          ...payload
        });
      }
      createNotification({
        type: "success",
        text: `Successfully ${policy ? "updated" : "created"} agent policy`
      });
      onOpenChange(false);
    } catch {
      // The shared mutation error handler surfaces the API error.
    }
  };

  return (
    <Sheet open={isOpen} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="flex flex-col gap-0 sm:max-w-xl">
        <SheetHeader className="border-b">
          <SheetTitle>{policy ? "Edit Agent Policy" : "Create Agent Policy"}</SheetTitle>
          <SheetDescription>
            What these agents may reach, and which secret is brokered when they do.
          </SheetDescription>
        </SheetHeader>
        <form onSubmit={handleSubmit(onSubmit)} className="flex min-h-0 flex-1 flex-col">
          <div className="flex thin-scrollbar flex-1 flex-col gap-4 overflow-y-auto p-4">
            <Controller
              control={control}
              name="name"
              render={({ field, fieldState: { error } }) => (
                <Field>
                  <FieldLabel>Name</FieldLabel>
                  <FieldContent>
                    <Input {...field} placeholder="slack-read" isError={Boolean(error)} autoFocus />
                  </FieldContent>
                  {error && <FieldError>{error.message}</FieldError>}
                </Field>
              )}
            />
            <Controller
              control={control}
              name="agents"
              render={({ field: { onChange, value }, fieldState: { error } }) => (
                <Field>
                  <FieldLabel>Applies to</FieldLabel>
                  <FieldContent>
                    <FilterableSelect
                      isMulti
                      placeholder="Select agents..."
                      options={agentOptions}
                      value={value}
                      onChange={onChange}
                      getOptionValue={(option) => option.identityId}
                      getOptionLabel={(option) => option.name}
                      isError={Boolean(error)}
                    />
                  </FieldContent>
                  <FieldDescription>
                    Only machine identities marked as an agent can be selected.
                  </FieldDescription>
                  {error && <FieldError>{error.message}</FieldError>}
                </Field>
              )}
            />
            <Controller
              control={control}
              name="target"
              render={({ field: { onChange, value }, fieldState: { error } }) => (
                <Field>
                  <FieldLabel>Target</FieldLabel>
                  <FieldContent>
                    <FilterableSelect
                      placeholder="Select target..."
                      options={targetOptions}
                      value={value}
                      onChange={onChange}
                      getOptionValue={(option) => option.key}
                      getOptionLabel={(option) => option.label}
                      isDisabled={isEdit}
                      isError={Boolean(error)}
                    />
                  </FieldContent>
                  <FieldDescription>
                    {isEdit
                      ? "The target is fixed once a policy is created."
                      : "Seeds the credentials this policy needs and its rules."}
                  </FieldDescription>
                  {error && <FieldError>{error.message}</FieldError>}
                </Field>
              )}
            />
            {credentials.length > 0 && (
              <div className="flex flex-col gap-2">
                <FieldLabel>Credentials</FieldLabel>
                <div className="flex flex-col gap-4 rounded-md border border-border bg-container/50 p-4">
                  {credentials.map((credential, i) => (
                    <div key={credential.slotKey} className="flex flex-col gap-2">
                      <span className="text-xs text-label">{credential.label}</span>
                      <Controller
                        control={control}
                        name={`credentials.${i}`}
                        render={({ field: { onChange, value }, fieldState }) => (
                          <Field>
                            <FieldContent>
                              <SecretPickerPopover
                                value={
                                  value.secretKey
                                    ? {
                                        environment: value.environment.slug,
                                        secretPath: value.secretPath,
                                        secretKey: value.secretKey
                                      }
                                    : undefined
                                }
                                onChange={(selection) =>
                                  onChange({
                                    ...value,
                                    environment:
                                      environmentOptions.find(
                                        (env) => env.slug === selection.environment
                                      ) ?? value.environment,
                                    secretPath: selection.secretPath,
                                    secretKey: selection.secretKey
                                  })
                                }
                                isError={Boolean(fieldState.error)}
                              />
                            </FieldContent>
                            {fieldState.error && (
                              <FieldError>Select a secret for this credential</FieldError>
                            )}
                          </Field>
                        )}
                      />
                    </div>
                  ))}
                </div>
                <FieldDescription>
                  You need permission to read each secret you attach here.
                </FieldDescription>
              </div>
            )}
            <PolicyRulesFields control={control} errors={errors} />
          </div>
          <SheetFooter className="border-t">
            <Button
              type="submit"
              variant="project"
              isPending={isSubmitting}
              isDisabled={isSubmitting}
            >
              {policy ? "Save" : "Create"}
            </Button>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
          </SheetFooter>
        </form>
      </SheetContent>
    </Sheet>
  );
};
