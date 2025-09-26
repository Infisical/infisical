import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useQuery } from "@tanstack/react-query";
import { z } from "zod";

import { createNotification } from "@app/components/notifications";
import { NamespacePermissionCan } from "@app/components/permissions";
import { Button, FormControl, Input, TextArea } from "@app/components/v2";
import { useNamespace } from "@app/context";
import {
  NamespacePermissionActions,
  NamespacePermissionSubjects
} from "@app/context/NamespacePermissionContext/types";
import { namespacesQueryKeys, useUpdateNamespace } from "@app/hooks/api/namespaces";

const baseFormSchema = z.object({
  name: z
    .string()
    .min(1, "Required")
    .max(64, "Too long, maximum length is 64 characters")
    .regex(
      /^[a-z0-9]+(?:[_-][a-z0-9]+)*$/,
      "Namespace name can only contain lowercase letters and numbers, with optional single hyphens (-) or underscores (_) between words. Cannot start or end with a hyphen or underscore."
    ),
  description: z
    .string()
    .trim()
    .max(256, "Description too long, max length is 256 characters")
    .optional()
});

type BaseFormData = z.infer<typeof baseFormSchema>;

export const OverviewSection = () => {
  const { namespaceName } = useNamespace();
  const getNamespaceQuery = useQuery(
    namespacesQueryKeys.detail({
      name: namespaceName
    })
  );

  const { mutateAsync, isPending } = useUpdateNamespace();
  const { handleSubmit, control } = useForm<BaseFormData>({
    resolver: zodResolver(baseFormSchema),
    values: getNamespaceQuery?.data
  });

  const onFormSubmit = async (data: BaseFormData) => {
    try {
      await mutateAsync({
        name: namespaceName,
        description: data.description,
        newName: data.name
      });

      createNotification({
        text: "Successfully updated namespace",
        type: "success"
      });
    } catch (err) {
      console.error(err);
      createNotification({
        text: "Failed to update namespace",
        type: "error"
      });
    }
  };

  return (
    <div className="mb-6 rounded-lg border border-mineshaft-600 bg-mineshaft-900 p-4">
      <div className="justify-betweens flex">
        <h2 className="mb-8 flex-1 text-xl font-semibold text-mineshaft-100">Namespace Overview</h2>
        <div className="space-x-2">
          <Button
            variant="outline_bg"
            size="sm"
            onClick={() => {
              navigator.clipboard.writeText(namespaceName || "");
              createNotification({
                text: "Copied namespace name to clipboard",
                type: "success"
              });
            }}
            title="Click to copy namespace name"
          >
            Copy Namespace Name
          </Button>
        </div>
      </div>
      <div>
        <form onSubmit={handleSubmit(onFormSubmit)} className="flex w-full flex-col gap-0">
          <div className="flex w-full flex-row items-end gap-4">
            <div className="w-full max-w-md">
              <NamespacePermissionCan
                I={NamespacePermissionActions.Edit}
                a={NamespacePermissionSubjects.Namespace}
              >
                {(isAllowed) => (
                  <Controller
                    defaultValue=""
                    render={({ field, fieldState: { error } }) => (
                      <FormControl
                        isError={Boolean(error)}
                        errorText={error?.message}
                        label="Project name"
                      >
                        <Input
                          placeholder="Project name"
                          {...field}
                          className="bg-mineshaft-800"
                          isDisabled={!isAllowed}
                        />
                      </FormControl>
                    )}
                    control={control}
                    name="name"
                  />
                )}
              </NamespacePermissionCan>
            </div>
          </div>
          <div className="flex w-full flex-row items-end gap-4">
            <div className="w-full max-w-md">
              <NamespacePermissionCan
                I={NamespacePermissionActions.Edit}
                a={NamespacePermissionSubjects.Namespace}
              >
                {(isAllowed) => (
                  <Controller
                    defaultValue=""
                    render={({ field, fieldState: { error } }) => (
                      <FormControl
                        isError={Boolean(error)}
                        errorText={error?.message}
                        label="Namespace description"
                      >
                        <TextArea
                          placeholder="Namespace description"
                          {...field}
                          rows={3}
                          className="thin-scrollbar max-w-md !resize-none bg-mineshaft-800"
                          isDisabled={!isAllowed}
                        />
                      </FormControl>
                    )}
                    control={control}
                    name="description"
                  />
                )}
              </NamespacePermissionCan>
            </div>
          </div>
          <div>
            <NamespacePermissionCan
              I={NamespacePermissionActions.Edit}
              a={NamespacePermissionSubjects.Namespace}
            >
              {(isAllowed) => (
                <Button
                  colorSchema="secondary"
                  type="submit"
                  isLoading={isPending}
                  isDisabled={isPending || !isAllowed}
                >
                  Save
                </Button>
              )}
            </NamespacePermissionCan>
          </div>
        </form>
      </div>
    </div>
  );
};
