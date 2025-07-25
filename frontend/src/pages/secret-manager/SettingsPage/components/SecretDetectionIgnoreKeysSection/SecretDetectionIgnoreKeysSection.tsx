import { useEffect } from "react";
import { Controller, useFieldArray, useForm } from "react-hook-form";
import { faPlus, faTrash } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";

import { createNotification } from "@app/components/notifications";
import { Button, FormControl, IconButton, Input } from "@app/components/v2";
import { useProjectPermission, useWorkspace } from "@app/context";
import { useUpdateProject } from "@app/hooks/api";
import { ProjectMembershipRole } from "@app/hooks/api/roles/types";

const formSchema = z.object({
  ignoreKeys: z
    .object({
      key: z.string().trim().min(1, "Secret key name is required")
    })
    .array()
    .default([])
});

type TForm = z.infer<typeof formSchema>;

export const SecretDetectionIgnoreKeysSection = () => {
  const { currentWorkspace } = useWorkspace();
  const { membership } = useProjectPermission();
  const { mutateAsync: updateProject } = useUpdateProject();

  const {
    control,
    formState: { isSubmitting, isDirty },
    handleSubmit,
    reset
  } = useForm<TForm>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      ignoreKeys: []
    }
  });

  const ignoreKeysFormFields = useFieldArray({
    control,
    name: "ignoreKeys"
  });

  useEffect(() => {
    const existingIgnoreKeys = currentWorkspace?.secretDetectionIgnoreKeys || [];
    reset({
      ignoreKeys:
        existingIgnoreKeys.length > 0 ? existingIgnoreKeys.map((key) => ({ key })) : [{ key: "" }] // Show one empty field by default
    });
  }, [currentWorkspace?.secretDetectionIgnoreKeys, reset]);

  const handleIgnoreKeysSubmit = async ({ ignoreKeys }: TForm) => {
    try {
      await updateProject({
        projectID: currentWorkspace.id,
        secretDetectionIgnoreKeys: ignoreKeys.map((item) => item.key)
      });

      createNotification({
        text: "Successfully updated secret detection ignore keys",
        type: "success"
      });
    } catch {
      createNotification({
        text: "Failed updating secret detection ignore keys",
        type: "error"
      });
    }
  };

  const isAdmin = membership.roles.includes(ProjectMembershipRole.Admin);

  if (!currentWorkspace) return null;

  return (
    <div className="mb-6 rounded-lg border border-mineshaft-600 bg-mineshaft-900 p-4">
      <div className="flex w-full items-center justify-between">
        <p className="text-xl font-semibold">Secret Detection Ignore Keys</p>
      </div>
      <p className="mb-4 mt-2 max-w-2xl text-sm text-gray-400">
        Define secret keys that should be ignored when scanning parameter folders for misplaced
        secrets. These keys will not trigger policy violation alerts even if they contain sensitive
        data.
      </p>

      <form onSubmit={handleSubmit(handleIgnoreKeysSubmit)} autoComplete="off">
        <div className="mb-4">
          <p className="mb-3 text-sm font-medium text-gray-300">Ignored Secret Keys</p>
          <div className="flex flex-col space-y-2">
            {ignoreKeysFormFields.fields.map(({ id: ignoreKeyFieldId }, i) => (
              <div key={ignoreKeyFieldId} className="flex items-end space-x-2">
                <div className="flex-grow">
                  {i === 0 && <span className="text-xs text-mineshaft-400">Secret Key Name</span>}
                  <Controller
                    control={control}
                    name={`ignoreKeys.${i}.key`}
                    render={({ field, fieldState: { error } }) => (
                      <FormControl
                        isError={Boolean(error?.message)}
                        errorText={error?.message}
                        className="mb-0"
                      >
                        <Input {...field} placeholder="PUBLIC_API_KEY" isDisabled={!isAdmin} />
                      </FormControl>
                    )}
                  />
                </div>
                <IconButton
                  ariaLabel="delete ignore key"
                  className="bottom-0.5 h-9"
                  variant="outline_bg"
                  onClick={() => ignoreKeysFormFields.remove(i)}
                  isDisabled={!isAdmin}
                >
                  <FontAwesomeIcon icon={faTrash} />
                </IconButton>
              </div>
            ))}
            <div className="mt-2 flex justify-end">
              <Button
                leftIcon={<FontAwesomeIcon icon={faPlus} />}
                size="xs"
                variant="outline_bg"
                onClick={() => ignoreKeysFormFields.append({ key: "" })}
                isDisabled={!isAdmin}
              >
                Add Ignore Key
              </Button>
            </div>
          </div>
        </div>

        <Button
          colorSchema="secondary"
          type="submit"
          isLoading={isSubmitting}
          disabled={!isAdmin || !isDirty}
        >
          Save
        </Button>
      </form>
    </div>
  );
};
