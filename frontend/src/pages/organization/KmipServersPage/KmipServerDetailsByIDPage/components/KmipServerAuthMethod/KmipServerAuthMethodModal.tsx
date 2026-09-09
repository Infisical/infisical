import { useEffect } from "react";
import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";

import { createNotification } from "@app/components/notifications";
import {
  Button,
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Field,
  FieldDescription,
  FieldError,
  FieldLabel,
  Input,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from "@app/components/v3";
import { useScopeVariant } from "@app/hooks";
import { useUpdateKmipServer } from "@app/hooks/api/kmipServers";
import { TKmipServerAuthMethodView } from "@app/hooks/api/kmipServers/types";

const METHOD_OPTIONS: { value: SettableMethod; label: string }[] = [
  { value: "token", label: "Token Auth" },
  { value: "aws", label: "AWS Auth" }
];

const DEFAULT_STS_ENDPOINT = "https://sts.amazonaws.com/";

const schema = z
  .object({
    method: z.enum(["aws", "token"]),
    stsEndpoint: z.string().max(255, "STS endpoint must be at most 255 characters"),
    allowedPrincipalArns: z
      .string()
      .max(4096, "Allowed principal ARNs must be at most 4096 characters"),
    allowedAccountIds: z.string().max(2048, "Allowed account IDs must be at most 2048 characters")
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

const toFormDefaults = (currentMethod: TKmipServerAuthMethodView): FormData => {
  const aws = currentMethod.method === "aws" ? currentMethod.config : null;
  return {
    method: currentMethod.method === "aws" ? "aws" : "token",
    stsEndpoint: aws?.stsEndpoint ?? DEFAULT_STS_ENDPOINT,
    allowedPrincipalArns: aws?.allowedPrincipalArns ?? "",
    allowedAccountIds: aws?.allowedAccountIds ?? ""
  };
};

export const KmipServerAuthMethodModal = ({
  isOpen,
  onOpenChange,
  kmipServerId,
  currentMethod
}: Props) => {
  const { mutateAsync: updateKmipServer, isPending } = useUpdateKmipServer();
  const scopeVariant = useScopeVariant();

  const {
    control,
    handleSubmit,
    watch,
    reset,
    formState: { isSubmitting, isDirty }
  } = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: toFormDefaults(currentMethod)
  });

  useEffect(() => {
    if (isOpen) reset(toFormDefaults(currentMethod));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen]);

  const method = watch("method");

  const onSubmit = async (form: FormData) => {
    try {
      if (form.method === "aws") {
        await updateKmipServer({
          kmipServerId,
          authMethod: {
            method: "aws",
            stsEndpoint: form.stsEndpoint,
            allowedPrincipalArns: form.allowedPrincipalArns,
            allowedAccountIds: form.allowedAccountIds
          }
        });
      } else {
        await updateKmipServer({ kmipServerId, authMethod: { method: "token" } });
      }
      createNotification({ type: "success", text: "Auth method updated" });
      onOpenChange(false);
    } catch {
      createNotification({ type: "error", text: "Failed to update auth method" });
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Edit Auth Method</DialogTitle>
          <DialogDescription>
            Switch the KMIP server&apos;s auth method or update the current method&apos;s config.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-4">
          <Controller
            control={control}
            name="method"
            render={({ field: { onChange, value }, fieldState: { error } }) => (
              <Field data-invalid={Boolean(error)}>
                <FieldLabel htmlFor="kmip-server-auth-method">Method</FieldLabel>
                <Select value={value} onValueChange={onChange}>
                  <SelectTrigger
                    id="kmip-server-auth-method"
                    isError={Boolean(error)}
                    className="w-full"
                  >
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {METHOD_OPTIONS.map((option) => (
                      <SelectItem key={option.value} value={option.value}>
                        {option.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <FieldError>{error?.message}</FieldError>
              </Field>
            )}
          />

          {method === "aws" && (
            <>
              <Controller
                control={control}
                name="allowedPrincipalArns"
                render={({ field, fieldState: { error } }) => (
                  <Field data-invalid={Boolean(error)}>
                    <FieldLabel htmlFor="kmip-server-allowed-principal-arns">
                      Allowed Principal ARNs
                    </FieldLabel>
                    <Input
                      {...field}
                      id="kmip-server-allowed-principal-arns"
                      isError={Boolean(error)}
                      placeholder="arn:aws:iam::123456789012:role/MyRoleName, arn:aws:iam::123456789012:user/MyUserName"
                    />
                    <FieldDescription>
                      Comma-separated. Set at least one of allowed principal ARNs or allowed account
                      IDs.
                    </FieldDescription>
                    <FieldError>{error?.message}</FieldError>
                  </Field>
                )}
              />
              <Controller
                control={control}
                name="allowedAccountIds"
                render={({ field, fieldState: { error } }) => (
                  <Field data-invalid={Boolean(error)}>
                    <FieldLabel htmlFor="kmip-server-allowed-account-ids">
                      Allowed Account IDs
                    </FieldLabel>
                    <Input
                      {...field}
                      id="kmip-server-allowed-account-ids"
                      isError={Boolean(error)}
                      placeholder="123456789012, 210987654321"
                    />
                    <FieldError>{error?.message}</FieldError>
                  </Field>
                )}
              />
              <Controller
                control={control}
                name="stsEndpoint"
                render={({ field, fieldState: { error } }) => (
                  <Field data-invalid={Boolean(error)}>
                    <FieldLabel htmlFor="kmip-server-sts-endpoint">STS Endpoint</FieldLabel>
                    <Input
                      {...field}
                      id="kmip-server-sts-endpoint"
                      isError={Boolean(error)}
                      placeholder={DEFAULT_STS_ENDPOINT}
                    />
                    <FieldError>{error?.message}</FieldError>
                  </Field>
                )}
              />
            </>
          )}

          <DialogFooter>
            <DialogClose asChild>
              <Button type="button" variant="ghost">
                Cancel
              </Button>
            </DialogClose>
            <Button
              type="submit"
              variant={scopeVariant}
              isPending={isSubmitting || isPending}
              isDisabled={isSubmitting || isPending || !isDirty}
            >
              Update Auth Method
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
};

type SettableMethod = "aws" | "token";

type FormData = z.infer<typeof schema>;

type Props = {
  isOpen: boolean;
  onOpenChange: (isOpen: boolean) => void;
  kmipServerId: string;
  currentMethod: TKmipServerAuthMethodView;
};
