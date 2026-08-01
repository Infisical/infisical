import { useEffect } from "react";
import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";

import {
  Button,
  Field,
  FieldContent,
  FieldError,
  FieldLabel,
  FilterableSelect,
  Input
} from "@app/components/v3";
import { useOrganization } from "@app/context";

import {
  NETWORKING_AUTH_METHOD_OPTIONS,
  NetworkingAuthMethod,
  NetworkingAuthMethodOption,
  NetworkingAuthMethodSingleValue
} from "./NetworkingAuthMethodLabel";

const schema = z
  .object({
    method: z.enum(["aws", "token"]),
    stsEndpoint: z.string(),
    allowedPrincipalArns: z.string(),
    allowedAccountIds: z.string()
  })
  .superRefine((data, ctx) => {
    if (
      data.method === "aws" &&
      !data.allowedPrincipalArns.trim() &&
      !data.allowedAccountIds.trim()
    ) {
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
  });

type FormData = z.infer<typeof schema>;

type AuthMethod =
  | {
      method: "aws";
      config: {
        stsEndpoint: string;
        allowedPrincipalArns: string;
        allowedAccountIds: string;
      };
    }
  | {
      method: "token";
      config?: unknown;
    };

type Props = {
  currentMethod: AuthMethod;
  isDisabled?: boolean;
  isPending: boolean;
  onUpdate: (authMethod: FormData) => Promise<boolean>;
};

export const NetworkingAuthMethodForm = ({
  currentMethod,
  isDisabled = false,
  isPending,
  onUpdate
}: Props) => {
  const { isSubOrganization } = useOrganization();
  const initialMethod: NetworkingAuthMethod = currentMethod.method;
  const initialAws = currentMethod.method === "aws" ? currentMethod.config : undefined;
  const defaultValues: FormData = {
    method: initialMethod,
    stsEndpoint: initialAws?.stsEndpoint ?? "https://sts.amazonaws.com/",
    allowedPrincipalArns: initialAws?.allowedPrincipalArns ?? "",
    allowedAccountIds: initialAws?.allowedAccountIds ?? ""
  };

  const {
    control,
    handleSubmit,
    watch,
    reset,
    formState: { isSubmitting, isDirty }
  } = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues
  });

  useEffect(() => {
    reset(defaultValues);
    // The individual method values below are the server-backed reset boundary.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    currentMethod.method,
    initialAws?.stsEndpoint,
    initialAws?.allowedPrincipalArns,
    initialAws?.allowedAccountIds,
    reset
  ]);

  const method = watch("method");
  const isSaving = isSubmitting || isPending;

  const submit = async (form: FormData) => {
    if (await onUpdate(form)) {
      reset(form);
    }
  };

  return (
    <form onSubmit={handleSubmit(submit)} className="space-y-3">
      <Controller
        control={control}
        name="method"
        render={({ field }) => {
          const selected =
            NETWORKING_AUTH_METHOD_OPTIONS.find((option) => option.value === field.value) ??
            NETWORKING_AUTH_METHOD_OPTIONS[0];

          return (
            <FilterableSelect
              value={selected}
              onChange={(option) => {
                const next = option as { value: NetworkingAuthMethod } | null;
                if (next) field.onChange(next.value);
              }}
              options={NETWORKING_AUTH_METHOD_OPTIONS}
              isSearchable={false}
              isClearable={false}
              isDisabled={isDisabled || isSaving}
              getOptionLabel={(option) => option.label}
              getOptionValue={(option) => option.value}
              components={{
                Option: NetworkingAuthMethodOption,
                SingleValue: NetworkingAuthMethodSingleValue
              }}
            />
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
                    disabled={isDisabled || isSaving}
                    isError={Boolean(error)}
                    placeholder="arn:aws:iam::123456789012:role/MyRoleName, ..."
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
                  <Input
                    {...field}
                    disabled={isDisabled || isSaving}
                    isError={Boolean(error)}
                    placeholder="123456789012, ..."
                  />
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
                    disabled={isDisabled || isSaving}
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

      {isDirty && (
        <div className="flex justify-end gap-2">
          <Button
            type="button"
            size="sm"
            variant="ghost"
            isDisabled={isSaving}
            onClick={() => reset()}
          >
            Cancel
          </Button>
          <Button
            type="submit"
            size="sm"
            variant={isSubOrganization ? "sub-org" : "org"}
            isPending={isSaving}
            isDisabled={isDisabled || isSaving}
          >
            Update
          </Button>
        </div>
      )}
    </form>
  );
};
