import { useEffect } from "react";
import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";

import { createNotification } from "@app/components/notifications";
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Field,
  FieldContent,
  FieldError,
  FieldLabel,
  FilterableSelect,
  Input
} from "@app/components/v3";
import { useOrganization } from "@app/context";
import { useUpdateGateway } from "@app/hooks/api/gateways-v2";
import { GatewayAuthMethodView } from "@app/hooks/api/gateways-v2/types";

type SettableMethod = "aws" | "token";

const METHOD_OPTIONS: { value: SettableMethod; label: string }[] = [
  { value: "token", label: "Token Auth" },
  { value: "aws", label: "AWS Auth" }
];

const schema = z
  .object({
    method: z.enum(["aws", "token"]),
    stsEndpoint: z.string(),
    allowedPrincipalArns: z.string(),
    allowedAccountIds: z.string()
  })
  .superRefine((data, ctx) => {
    if (data.method === "aws") {
      const hasArns = data.allowedPrincipalArns.trim().length > 0;
      const hasAccountIds = data.allowedAccountIds.trim().length > 0;
      if (!hasArns && !hasAccountIds) {
        const message = "At least one of allowed principal ARNs or allowed account IDs must be set";
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["allowedPrincipalArns"],
          message
        });
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["allowedAccountIds"],
          message
        });
      }
    }
  });

type FormData = z.infer<typeof schema>;

type Props = {
  isOpen: boolean;
  onOpenChange: (isOpen: boolean) => void;
  gatewayId: string;
  currentMethod: GatewayAuthMethodView;
};

export const GatewayAuthMethodModal = ({
  isOpen,
  onOpenChange,
  gatewayId,
  currentMethod
}: Props) => {
  const { mutateAsync: updateGateway, isPending } = useUpdateGateway();
  const { isSubOrganization } = useOrganization();

  const initialMethod: SettableMethod = currentMethod.method === "aws" ? "aws" : "token";
  const initialAws = currentMethod.method === "aws" ? currentMethod.config : null;

  const {
    control,
    handleSubmit,
    watch,
    reset,
    formState: { isSubmitting, isDirty }
  } = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: {
      method: initialMethod,
      stsEndpoint: initialAws?.stsEndpoint ?? "https://sts.amazonaws.com/",
      allowedPrincipalArns: initialAws?.allowedPrincipalArns ?? "",
      allowedAccountIds: initialAws?.allowedAccountIds ?? ""
    }
  });

  useEffect(() => {
    if (isOpen) {
      reset({
        method: initialMethod,
        stsEndpoint: initialAws?.stsEndpoint ?? "https://sts.amazonaws.com/",
        allowedPrincipalArns: initialAws?.allowedPrincipalArns ?? "",
        allowedAccountIds: initialAws?.allowedAccountIds ?? ""
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen]);

  const method = watch("method");

  const onSubmit = async (form: FormData) => {
    try {
      if (form.method === "aws") {
        await updateGateway({
          gatewayId,
          authMethod: {
            method: "aws",
            stsEndpoint: form.stsEndpoint,
            allowedPrincipalArns: form.allowedPrincipalArns,
            allowedAccountIds: form.allowedAccountIds
          }
        });
      } else {
        await updateGateway({ gatewayId, authMethod: { method: "token" } });
      }
      createNotification({ type: "success", text: "Auth method updated" });
      onOpenChange(false);
    } catch {
      createNotification({ type: "error", text: "Failed to update auth method" });
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg overflow-visible">
        <DialogHeader>
          <DialogTitle>Edit Auth Method</DialogTitle>
          <DialogDescription>
            Switch the gateway&apos;s auth method or update the current method&apos;s config.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <Controller
            control={control}
            name="method"
            render={({ field }) => {
              const selected =
                METHOD_OPTIONS.find((o) => o.value === field.value) ?? METHOD_OPTIONS[0];
              return (
                <Field>
                  <FieldLabel>Method</FieldLabel>
                  <FieldContent>
                    <FilterableSelect
                      value={selected}
                      onChange={(opt) => {
                        const next = opt as { value: SettableMethod } | null;
                        if (next) field.onChange(next.value);
                      }}
                      options={METHOD_OPTIONS}
                      isSearchable={false}
                      isClearable={false}
                      getOptionLabel={(o) => o.label}
                      getOptionValue={(o) => o.value}
                    />
                  </FieldContent>
                </Field>
              );
            }}
          />

          {method === "aws" && (
            <>
              <Controller
                control={control}
                name="allowedPrincipalArns"
                render={({ field, fieldState: { error } }) => (
                  <Field>
                    <FieldLabel>Allowed Principal ARNs</FieldLabel>
                    <FieldContent>
                      <Input
                        {...field}
                        isError={Boolean(error)}
                        placeholder="arn:aws:iam::123456789012:role/MyRoleName, arn:aws:iam::123456789012:user/MyUserName..."
                      />
                      <FieldError errors={[error]} />
                    </FieldContent>
                  </Field>
                )}
              />
              <Controller
                control={control}
                name="allowedAccountIds"
                render={({ field, fieldState: { error } }) => (
                  <Field>
                    <FieldLabel>Allowed Account IDs</FieldLabel>
                    <FieldContent>
                      <Input {...field} isError={Boolean(error)} placeholder="123456789012, ..." />
                      <FieldError errors={[error]} />
                    </FieldContent>
                  </Field>
                )}
              />
              <Controller
                control={control}
                name="stsEndpoint"
                render={({ field, fieldState: { error } }) => (
                  <Field>
                    <FieldLabel>STS Endpoint</FieldLabel>
                    <FieldContent>
                      <Input
                        {...field}
                        isError={Boolean(error)}
                        placeholder="https://sts.amazonaws.com/"
                      />
                      <FieldError errors={[error]} />
                    </FieldContent>
                  </Field>
                )}
              />
            </>
          )}

          <DialogFooter className="gap-2 sm:gap-2">
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button
              type="submit"
              variant={isSubOrganization ? "sub-org" : "org"}
              isPending={isSubmitting || isPending}
              isDisabled={isSubmitting || isPending || !isDirty}
            >
              Update
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
};
