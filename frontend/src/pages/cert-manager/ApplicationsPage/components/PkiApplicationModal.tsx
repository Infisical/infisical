import { useEffect, useMemo } from "react";
import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Link, useParams } from "@tanstack/react-router";
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
  FieldDescription,
  FieldError,
  FieldLabel,
  FilterableSelect,
  Input,
  TextArea
} from "@app/components/v3";
import { useListCertificateProfiles } from "@app/hooks/api/certificateProfiles";
import {
  TPkiApplication,
  useCreatePkiApplication,
  useUpdatePkiApplication
} from "@app/hooks/api/pkiApplications";
import { UsePopUpState } from "@app/hooks/usePopUp";

const SLUG_REGEX = /^[a-z0-9-]+$/;

const schema = z.object({
  name: z
    .string()
    .trim()
    .min(1, "Name is required")
    .max(64)
    .regex(SLUG_REGEX, "Name must contain only lowercase letters, numbers, and hyphens"),
  description: z.string().trim().max(256).optional(),
  profileIds: z.array(z.object({ value: z.string(), label: z.string() })).optional()
});

type FormData = z.infer<typeof schema>;

type Props = {
  popUp: UsePopUpState<["application"]>;
  handlePopUpToggle: (popUpName: keyof UsePopUpState<["application"]>, state?: boolean) => void;
};

export const PkiApplicationModal = ({ popUp, handlePopUpToggle }: Props) => {
  const { projectId, orgId } = useParams({ strict: false });
  const editing = (popUp?.application?.data as TPkiApplication | undefined) ?? null;
  const create = useCreatePkiApplication();
  const update = useUpdatePkiApplication();

  const { data: profilesData, isPending: profilesLoading } = useListCertificateProfiles({
    limit: 100
  });

  const profileOptions = useMemo(
    () =>
      (profilesData?.certificateProfiles ?? []).map((p) => ({
        value: p.id,
        label: p.slug
      })),
    [profilesData]
  );

  const {
    control,
    handleSubmit,
    reset,
    formState: { isSubmitting }
  } = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: { name: "", description: "", profileIds: [] }
  });

  useEffect(() => {
    if (editing) {
      reset({
        name: editing.name,
        description: editing.description ?? "",
        profileIds: []
      });
    } else {
      reset({ name: "", description: "", profileIds: [] });
    }
  }, [editing, reset]);

  const onSubmit = async (data: FormData) => {
    try {
      if (editing) {
        await update.mutateAsync({
          applicationId: editing.id,
          name: data.name,
          description: data.description?.length ? data.description : null
        });
        createNotification({ type: "success", text: "Application updated" });
      } else {
        const selectedIds = (data.profileIds ?? []).map((p) => p.value);
        await create.mutateAsync({
          name: data.name,
          description: data.description,
          profileIds: selectedIds
        });
        createNotification({ type: "success", text: "Application created" });
      }
      handlePopUpToggle("application", false);
    } catch (err) {
      const detail = err instanceof Error ? err.message : "Failed to save application.";
      createNotification({ type: "error", text: detail });
    }
  };

  return (
    <Dialog
      open={popUp?.application?.isOpen}
      onOpenChange={(isOpen) => handlePopUpToggle("application", isOpen)}
    >
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{editing ? "Edit Application" : "Create Application"}</DialogTitle>
          <DialogDescription>
            {editing
              ? "Update this Application's name and description."
              : "A logical grouping for a service or workload that needs certificates."}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-3">
          <Controller
            control={control}
            name="name"
            render={({ field, fieldState: { error } }) => (
              <Field>
                <FieldLabel>Name</FieldLabel>
                <FieldContent>
                  <Input {...field} placeholder="my-service" />
                </FieldContent>
                {error ? <FieldError>{error.message}</FieldError> : null}
              </Field>
            )}
          />
          <Controller
            control={control}
            name="description"
            render={({ field, fieldState: { error } }) => (
              <Field>
                <FieldLabel>Description</FieldLabel>
                <FieldContent>
                  <TextArea
                    {...field}
                    placeholder="Issues and rotates certificates for my application stack."
                  />
                </FieldContent>
                {error ? <FieldError>{error.message}</FieldError> : null}
              </Field>
            )}
          />
          {!editing ? (
            <Controller
              control={control}
              name="profileIds"
              render={({ field, fieldState: { error } }) => (
                <Field>
                  <FieldLabel>Certificate Profiles</FieldLabel>
                  <FieldContent>
                    <FilterableSelect
                      isMulti
                      value={field.value ?? []}
                      onChange={(val) =>
                        field.onChange((val ?? []) as { value: string; label: string }[])
                      }
                      options={profileOptions}
                      placeholder="Select profiles to attach..."
                    />
                  </FieldContent>
                  <FieldDescription>
                    Select the profiles this application can issue certificates from.{" "}
                    {!profilesLoading && !profileOptions.length && (
                      <Link
                        to="/organizations/$orgId/projects/cert-manager/$projectId/certificate-profiles"
                        params={{ orgId: orgId ?? "", projectId: projectId ?? "" }}
                        className="underline hover:text-yellow-400"
                      >
                        Create one in Certificate Profiles
                      </Link>
                    )}
                  </FieldDescription>
                  {error ? <FieldError>{error.message}</FieldError> : null}
                </Field>
              )}
            />
          ) : null}

          <DialogFooter className="mt-4">
            <Button
              type="button"
              variant="ghost"
              onClick={() => handlePopUpToggle("application", false)}
            >
              Cancel
            </Button>
            <Button type="submit" variant="project" isPending={isSubmitting}>
              {editing ? "Save Changes" : "Create Application"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
};
