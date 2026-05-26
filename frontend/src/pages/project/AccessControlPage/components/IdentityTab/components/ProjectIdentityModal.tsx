import { Controller, useFieldArray, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useNavigate } from "@tanstack/react-router";
import { PlusIcon, TrashIcon } from "lucide-react";
import { twMerge } from "tailwind-merge";
import { z } from "zod";

import { createNotification } from "@app/components/notifications";
import { RoleOption } from "@app/components/roles";
import {
  Button,
  Field,
  FieldContent,
  FieldDescription,
  FieldError,
  FieldLabel,
  FilterableSelect,
  IconButton,
  Input,
  Label,
  Switch
} from "@app/components/v3";
import { useProject } from "@app/context";
import { getProjectBaseURL } from "@app/helpers/project";
import {
  TProjectIdentity,
  useCreateProjectIdentity,
  useGetProjectRoles,
  useUpdateProjectIdentity,
  useUpdateProjectIdentityMembership
} from "@app/hooks/api";
import { useAddIdentityUniversalAuth } from "@app/hooks/api/identities";
import { ProjectType } from "@app/hooks/api/projects/types";
import { ProjectMembershipRole } from "@app/hooks/api/roles/types";

const schema = z.object({
  name: z.string().min(1, "Required"),
  hasDeleteProtection: z.boolean(),
  role: z.object({ slug: z.string(), name: z.string() }).optional(),
  metadata: z
    .object({
      key: z.string().trim().min(1),
      value: z.string().trim().min(1)
    })
    .array()
    .default([])
    .optional()
});
export type FormData = z.infer<typeof schema>;

type ContentProps = {
  onClose: () => void;
  identity?: TProjectIdentity;
};

export const ProjectIdentityModal = ({ onClose, identity }: ContentProps) => {
  const navigate = useNavigate();

  const { currentProject } = useProject();
  const isCertManager = currentProject.type === ProjectType.CertificateManager;

  const isUpdate = Boolean(identity);

  // Roles list is sourced product-aware (cert-manager filters to Admin + Member server-side).
  const { data: roles } = useGetProjectRoles(currentProject.id, currentProject.type);
  // For cert-manager, default to Member instead of No Access (No Access is filtered out server-side).
  const defaultRole = isCertManager
    ? { slug: ProjectMembershipRole.Member, name: "Member" }
    : { slug: ProjectMembershipRole.NoAccess, name: "No Access" };

  const { mutateAsync: createMutateAsync } = useCreateProjectIdentity();
  const { mutateAsync: updateMutateAsync } = useUpdateProjectIdentity();
  const { mutateAsync: addMutateAsync } = useAddIdentityUniversalAuth();
  const { mutateAsync: updateMembershipMutateAsync } = useUpdateProjectIdentityMembership();

  const {
    control,
    handleSubmit,
    reset,
    formState: { isSubmitting }
  } = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: {
      name: identity?.name ?? "",
      hasDeleteProtection: identity?.hasDeleteProtection ?? true,
      metadata: identity?.metadata ?? [],
      role: isUpdate ? undefined : defaultRole
    }
  });

  const metadataFormFields = useFieldArray({
    control,
    name: "metadata"
  });

  const onFormSubmit = async ({ name, role, metadata, hasDeleteProtection }: FormData) => {
    try {
      if (identity) {
        // update
        await updateMutateAsync({
          identityId: identity.id,
          name,
          hasDeleteProtection,
          projectId: currentProject.id,
          metadata
        });

        onClose();
      } else {
        const created = await createMutateAsync({
          name,
          projectId: currentProject.id,
          hasDeleteProtection,
          metadata
        });
        const createdId = created.id;

        if (role) {
          await updateMembershipMutateAsync({
            roles: [{ role: role.slug }],
            identityId: createdId,
            projectId: currentProject.id,
            projectType: currentProject.type
          });
        }

        await addMutateAsync({
          projectId: currentProject.id,
          identityId: createdId,
          clientSecretTrustedIps: [{ ipAddress: "0.0.0.0/0" }, { ipAddress: "::/0" }],
          accessTokenTrustedIps: [{ ipAddress: "0.0.0.0/0" }, { ipAddress: "::/0" }],
          accessTokenTTL: 2592000,
          accessTokenMaxTTL: 2592000,
          accessTokenNumUsesLimit: 0,
          accessTokenPeriod: 0,
          lockoutEnabled: true,
          lockoutThreshold: 3,
          lockoutDurationSeconds: 300,
          lockoutCounterResetSeconds: 30
        });

        onClose();
        navigate({
          to: `${getProjectBaseURL(currentProject.type)}/identities/$identityId`,
          params: {
            identityId: createdId
          }
        });
      }

      createNotification({
        text: `Successfully ${isUpdate ? "updated" : "created"} machine identity`,
        type: "success"
      });

      reset();
    } catch (err) {
      console.error(err);
      const error = err as any;
      const text =
        error?.response?.data?.message ??
        `Failed to ${isUpdate ? "update" : "create"} machine identity`;

      createNotification({
        text,
        type: "error"
      });
    }
  };

  return (
    <form onSubmit={handleSubmit(onFormSubmit)} className="flex flex-col gap-4">
      <Controller
        control={control}
        defaultValue=""
        name="name"
        render={({ field, fieldState: { error } }) => (
          <Field>
            <FieldLabel>Name</FieldLabel>
            <FieldContent>
              <Input {...field} autoFocus placeholder="Machine 1" isError={Boolean(error)} />
            </FieldContent>
            {error && <FieldError>{error.message}</FieldError>}
          </Field>
        )}
      />
      {!isUpdate && (
        <Controller
          control={control}
          name="role"
          render={({ field: { onChange, value }, fieldState: { error } }) => (
            <Field>
              <FieldLabel>Role</FieldLabel>
              <FieldContent>
                <FilterableSelect
                  placeholder="Select role..."
                  options={roles}
                  onChange={onChange}
                  value={value}
                  getOptionValue={(option) => option.slug}
                  getOptionLabel={(option) => option.name}
                  components={{ Option: RoleOption }}
                  isError={Boolean(error)}
                />
              </FieldContent>
              {error && <FieldError>{error.message}</FieldError>}
            </Field>
          )}
        />
      )}
      <Controller
        control={control}
        name="hasDeleteProtection"
        render={({ field: { onChange, value } }) => (
          <Field orientation="horizontal">
            <Switch
              id="delete-protection-enabled"
              variant="project"
              checked={value}
              onCheckedChange={onChange}
            />
            <FieldContent>
              <Label htmlFor="delete-protection-enabled">Delete Protection</Label>
              <FieldDescription>
                Prevents this identity from being deleted while enabled.
              </FieldDescription>
            </FieldContent>
          </Field>
        )}
      />
      <div className="flex flex-col gap-2">
        <Label>Metadata</Label>
        <div
          className={`flex max-h-[30vh] thin-scrollbar flex-col gap-3 overflow-y-auto rounded-md border border-border bg-container/50 p-4 ${
            metadataFormFields.fields.length === 0 ? "border-dashed" : ""
          }`}
        >
          {metadataFormFields.fields.length === 0 ? (
            <p className="text-center text-sm text-muted">
              No metadata entries. Click below to add.
            </p>
          ) : (
            metadataFormFields.fields.map(({ id: metadataFieldId }, i) => (
              <div key={metadataFieldId} className="flex items-start gap-2">
                <Field className="flex-1">
                  {i === 0 && <FieldLabel className="text-xs">Key</FieldLabel>}
                  <FieldContent>
                    <Controller
                      control={control}
                      name={`metadata.${i}.key`}
                      render={({ field, fieldState: { error } }) => (
                        <>
                          <Input {...field} isError={Boolean(error)} />
                          {error && <FieldError>{error.message}</FieldError>}
                        </>
                      )}
                    />
                  </FieldContent>
                </Field>
                <Field className="flex-1">
                  {i === 0 && <FieldLabel className="text-xs">Value</FieldLabel>}
                  <FieldContent>
                    <Controller
                      control={control}
                      name={`metadata.${i}.value`}
                      render={({ field, fieldState: { error } }) => (
                        <>
                          <Input {...field} isError={Boolean(error)} />
                          {error && <FieldError>{error.message}</FieldError>}
                        </>
                      )}
                    />
                  </FieldContent>
                </Field>
                <IconButton
                  aria-label="Remove metadata entry"
                  variant="ghost"
                  size="sm"
                  type="button"
                  className={twMerge(i === 0 ? "mt-[27px]" : "mt-[3px]", "hover:text-danger")}
                  onClick={() => metadataFormFields.remove(i)}
                >
                  <TrashIcon />
                </IconButton>
              </div>
            ))
          )}
        </div>
        <div>
          <Button
            variant="ghost"
            size="xs"
            type="button"
            onClick={() => metadataFormFields.append({ key: "", value: "" })}
          >
            <PlusIcon className="mr-1 size-4" />
            Add Entry
          </Button>
        </div>
      </div>
      <div className="flex items-center justify-end gap-2">
        <Button type="button" variant="outline" onClick={onClose}>
          Cancel
        </Button>
        <Button type="submit" variant="project" isPending={isSubmitting} isDisabled={isSubmitting}>
          {isUpdate ? "Update" : "Create"}
        </Button>
      </div>
    </form>
  );
};
