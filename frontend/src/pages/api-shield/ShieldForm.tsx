import { Controller, useFieldArray, useForm } from "react-hook-form";
import { faPlus, faSave, faTrash } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { zodResolver } from "@hookform/resolvers/zod";
import { twMerge } from "tailwind-merge";
import { z } from "zod";

import { createNotification } from "@app/components/notifications";
import { Button, FormControl, FormLabel, IconButton, Input } from "@app/components/v2";
import { useWorkspace } from "@app/context";
import {
  useCreateBridge,
  TBridgeHeader,
  bridgeQueryKeys,
  useUpdateBridge
} from "@app/hooks/api/bridge";
import { useQuery } from "@tanstack/react-query";

const formSchema = z.object({
  slug: z.string().min(1, "Bridge name is required"),
  baseUrl: z.string().url("Base URL must be a valid URL"),
  openApiUrl: z.string().url("OpenAPI URL must be a valid URL"),
  headers: z
    .array(
      z.object({
        key: z.string().min(1, "Header key is required"),
        value: z.string().min(1, "Header value is required")
      })
    )
    .default([])
});

type TFormSchema = z.infer<typeof formSchema>;

type Props = {
  id?: string;
  onSuccess?: () => void;
  onCancel?: () => void;
};

export const ShieldForm = ({ onSuccess, onCancel, id }: Props) => {
  const isCreate = !id;
  const { currentWorkspace } = useWorkspace();
  const projectId = currentWorkspace?.id || "";
  const { data: bridgeDetails, isPending } = useQuery({
    ...bridgeQueryKeys.byId(id || ""),
    enabled: Boolean(id)
  });

  const form = useForm<TFormSchema>({
    resolver: zodResolver(formSchema),
    values: isCreate
      ? {
          slug: "",
          baseUrl: "",
          openApiUrl: "",
          headers: []
        }
      : bridgeDetails
  });

  const {
    control,
    handleSubmit,
    formState: { isDirty, isSubmitting, errors }
  } = form;

  const { fields, append, remove } = useFieldArray({
    control,
    name: "headers"
  });

  const { mutateAsync: createBridge } = useCreateBridge();
  const { mutateAsync: updateBridge } = useUpdateBridge();

  const onSubmit = async (data: TFormSchema) => {
    try {
      if (isCreate) {
        await createBridge({
          projectId,
          slug: data.slug,
          baseUrl: data.baseUrl,
          openApiUrl: data.openApiUrl,
          headers: data.headers,
          ruleSet: [
            [
              {
                field: "uriPath",
                operator: "wildcard",
                value: "*"
              }
            ]
          ] // Empty for now, can be extended later
        });
      } else {
        await updateBridge({
          id,
          slug: data.slug,
          baseUrl: data.baseUrl,
          openApiUrl: data.openApiUrl,
          headers: data.headers
        });
      }

      createNotification({
        type: "success",
        text: "Bridge created successfully"
      });

      onSuccess?.();
    } catch (err) {
      console.error(err);
      createNotification({
        type: "error",
        text: "Failed to create Bridge"
      });
    }
  };

  return (
    <form onSubmit={handleSubmit(onSubmit)}>
      <div className="space-y-4">
        <Controller
          control={control}
          name="slug"
          render={({ field }) => (
            <FormControl
              label="Bridge Name"
              isError={Boolean(errors.slug)}
              errorText={errors.slug?.message}
            >
              <Input {...field} placeholder="Enter bridge name" />
            </FormControl>
          )}
        />

        <Controller
          control={control}
          name="baseUrl"
          render={({ field }) => (
            <FormControl
              label="Base URL"
              isError={Boolean(errors.baseUrl)}
              errorText={errors.baseUrl?.message}
            >
              <Input {...field} placeholder="https://api.example.com" />
            </FormControl>
          )}
        />

        <Controller
          control={control}
          name="openApiUrl"
          render={({ field }) => (
            <FormControl
              label="OpenAPI URL"
              isError={Boolean(errors.openApiUrl)}
              errorText={errors.openApiUrl?.message}
            >
              <Input {...field} placeholder="https://api.example.com/openapi.json" />
            </FormControl>
          )}
        />

        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <FormLabel label="Headers" />
            <Button
              type="button"
              size="xs"
              variant="outline_bg"
              leftIcon={<FontAwesomeIcon icon={faPlus} />}
              onClick={() => append({ key: "", value: "" })}
            >
              Add Header
            </Button>
          </div>
          {fields.map((field, index) => (
            <div key={field.id} className="flex items-center space-x-2">
              <Controller
                control={control}
                name={`headers.${index}.key`}
                render={({ field: keyField }) => (
                  <FormControl
                    className="flex-1"
                    isError={Boolean(errors.headers?.[index]?.key)}
                    errorText={errors.headers?.[index]?.key?.message}
                  >
                    <Input {...keyField} placeholder="Header key" />
                  </FormControl>
                )}
              />
              <Controller
                control={control}
                name={`headers.${index}.value`}
                render={({ field: valueField }) => (
                  <FormControl
                    className="flex-1"
                    isError={Boolean(errors.headers?.[index]?.value)}
                    errorText={errors.headers?.[index]?.value?.message}
                  >
                    <Input {...valueField} placeholder="Header value" />
                  </FormControl>
                )}
              />
              <IconButton
                ariaLabel="Remove header"
                variant="plain"
                colorSchema="danger"
                onClick={() => remove(index)}
              >
                <FontAwesomeIcon icon={faTrash} />
              </IconButton>
            </div>
          ))}
        </div>
      </div>

      <div className="mt-8 flex items-center justify-end space-x-4">
        {onCancel && (
          <Button type="button" variant="plain" onClick={onCancel} isDisabled={isSubmitting}>
            Cancel
          </Button>
        )}
        <Button
          type="submit"
          isDisabled={!isDirty || isSubmitting}
          isLoading={isSubmitting}
          leftIcon={<FontAwesomeIcon icon={faSave} />}
        >
          {isCreate ? "Create " : "Update "}Shield
        </Button>
      </div>
    </form>
  );
};
