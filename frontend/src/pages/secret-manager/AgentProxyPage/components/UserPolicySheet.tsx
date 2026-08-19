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
import { PolicyRuleMethod, useGetAgentPolicyTargets } from "@app/hooks/api/agentPolicies";
import { useGetWorkspaceUsers } from "@app/hooks/api/projects/queries";
import { TUserPolicy, useCreateUserPolicy, useUpdateUserPolicy } from "@app/hooks/api/userPolicies";

import { PolicyRulesFields } from "./PolicyRulesFields";
import { findPolicyTemplate } from "./PolicyTargetCell";
import { PolicyTargetSelect } from "./PolicyTargetSelect";

const schema = z.object({
  name: z
    .string()
    .trim()
    .min(1, "Required")
    .max(64)
    .regex(/^[a-z0-9-]+$/, "Use lowercase letters, numbers and dashes"),
  target: z.object({ key: z.string(), label: z.string() }, { required_error: "Required" }),
  users: z
    .object({ userId: z.string(), label: z.string() })
    .array()
    .min(1, "Select at least one user"),
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
  policy?: TUserPolicy;
  onOpenChange: (isOpen: boolean) => void;
};

export const UserPolicySheet = ({ isOpen, policy, onOpenChange }: Props) => {
  const { projectId } = useProject();
  const isEdit = Boolean(policy);

  const { data: targets } = useGetAgentPolicyTargets();
  const { data: projectUsers } = useGetWorkspaceUsers(projectId, true);

  const createPolicy = useCreateUserPolicy();
  const updatePolicy = useUpdateUserPolicy();

  const userOptions = useMemo(
    () =>
      (projectUsers ?? []).map((member) => {
        const name = [member.user.firstName, member.user.lastName].filter(Boolean).join(" ");
        return {
          userId: member.user.id,
          label: name ? `${name} (${member.user.username})` : member.user.username
        };
      }),
    [projectUsers]
  );

  const targetOptions = useMemo(
    () =>
      (targets ?? []).map((target) => ({
        key: target.key,
        label: findPolicyTemplate(target.key)?.name ?? target.key
      })),
    [targets]
  );

  const {
    control,
    handleSubmit,
    reset,
    formState: { isSubmitting, errors }
  } = useForm<TForm>({
    resolver: zodResolver(schema),
    defaultValues: { name: "", users: [], rules: [{ hostPattern: "", methods: [] }] }
  });

  useEffect(() => {
    if (!isOpen) return;

    if (policy) {
      reset({
        name: policy.name,
        target: {
          key: policy.target,
          label: findPolicyTemplate(policy.target)?.name ?? policy.target
        },
        users: policy.users.map((user) => {
          const name = [user.firstName, user.lastName].filter(Boolean).join(" ");
          return {
            userId: user.userId,
            label: name ? `${name} (${user.username})` : user.username
          };
        }),
        rules: policy.rules.map((rule) => ({
          hostPattern: rule.hostPattern,
          methods: rule.methods
        }))
      });
    } else {
      reset({ name: "", users: [], rules: [{ hostPattern: "", methods: [] }] });
    }
  }, [isOpen, policy]);

  const onSubmit = async (form: TForm) => {
    const payload = {
      userIds: form.users.map((user) => user.userId),
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
        text: `Successfully ${policy ? "updated" : "created"} user policy`
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
          <SheetTitle>{policy ? "Edit User Policy" : "Create User Policy"}</SheetTitle>
          <SheetDescription>
            What these people may do through an agent. A request has to pass both sides.
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
                    <Input
                      {...field}
                      placeholder="slack-read-only"
                      isError={Boolean(error)}
                      autoFocus
                    />
                  </FieldContent>
                  {error && <FieldError>{error.message}</FieldError>}
                </Field>
              )}
            />
            <Controller
              control={control}
              name="users"
              render={({ field: { onChange, value }, fieldState: { error } }) => (
                <Field>
                  <FieldLabel>Applies to</FieldLabel>
                  <FieldContent>
                    <FilterableSelect
                      isMulti
                      placeholder="Select users..."
                      options={userOptions}
                      value={value}
                      onChange={onChange}
                      getOptionValue={(option) => option.userId}
                      getOptionLabel={(option) => option.label}
                      isError={Boolean(error)}
                    />
                  </FieldContent>
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
                    <PolicyTargetSelect
                      options={targetOptions}
                      value={value}
                      onChange={onChange}
                      isDisabled={isEdit}
                      isError={Boolean(error)}
                    />
                  </FieldContent>
                  <FieldDescription>
                    Groups this policy in the list. Matching is by rule, not by target.
                  </FieldDescription>
                  {error && <FieldError>{error.message}</FieldError>}
                </Field>
              )}
            />
            <PolicyRulesFields control={control} errors={errors} excludePolicyId={policy?.id} />
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
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
          </SheetFooter>
        </form>
      </SheetContent>
    </Sheet>
  );
};
