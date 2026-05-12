import { Controller, useFieldArray, useForm } from "react-hook-form";
import { faPlus, faTrash } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { zodResolver } from "@hookform/resolvers/zod";
import { useNavigate } from "@tanstack/react-router";
import { z } from "zod";

import { createNotification } from "@app/components/notifications";
import { RoleOption } from "@app/components/roles";
import {
  Button,
  FilterableSelect,
  FormControl,
  FormLabel,
  IconButton,
  Input,
  ModalClose,
  Switch
} from "@app/components/v2";
import { useOrganization, useProject } from "@app/context";
import { getProjectBaseURL } from "@app/helpers/project";
import { OrgMembershipRole } from "@app/helpers/roles";
import {
  TProjectIdentity,
  useCreateProjectIdentity,
  useCreateProjectIdentityMembership,
  useGetProjectRoles,
  useUpdateProjectIdentity,
  useUpdateProjectIdentityMembership
} from "@app/hooks/api";
import { useAddIdentityUniversalAuth } from "@app/hooks/api/identities";
import { useCreateOrgIdentity } from "@app/hooks/api/orgIdentity/mutations";
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
  const { currentOrg } = useOrganization();
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
  // Cert Manager can't create project-scoped identities — the project-level endpoint is blocked.
  // Identities are org-scoped there, so we create the identity at the org level (No Access on the
  // org by default), then assign it to Cert Manager with the chosen role.
  const { mutateAsync: createOrgIdentityAsync } = useCreateOrgIdentity();
  const { mutateAsync: assignToProjectAsync } = useCreateProjectIdentityMembership();

  const {
    control,
    handleSubmit,
    reset,
    formState: { isSubmitting }
  } = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: {
      name: identity?.name ?? "",
      hasDeleteProtection: identity?.hasDeleteProtection ?? false,
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
        // create — branch on Cert Manager (no project-scoped identities) vs other products
        let createdId: string;
        if (isCertManager) {
          const orgIdentity = await createOrgIdentityAsync({
            name,
            organizationId: currentOrg.id,
            role: OrgMembershipRole.NoAccess,
            hasDeleteProtection,
            metadata
          });
          createdId = orgIdentity.id;
          await assignToProjectAsync({
            identityId: createdId,
            projectId: currentProject.id,
            projectType: currentProject.type,
            role: role?.slug
          });
        } else {
          const created = await createMutateAsync({
            name,
            projectId: currentProject.id,
            hasDeleteProtection,
            metadata
          });
          createdId = created.id;

          if (role) {
            await updateMembershipMutateAsync({
              roles: [{ role: role.slug }],
              identityId: createdId,
              projectId: currentProject.id,
              projectType: currentProject.type
            });
          }
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
    <form onSubmit={handleSubmit(onFormSubmit)}>
      <Controller
        control={control}
        defaultValue=""
        name="name"
        render={({ field, fieldState: { error } }) => (
          <FormControl
            className="mb-4"
            label="Name"
            isError={Boolean(error)}
            errorText={error?.message}
          >
            <Input {...field} autoFocus placeholder="Machine 1" />
          </FormControl>
        )}
      />
      {!isUpdate && (
        <Controller
          control={control}
          name="role"
          render={({ field: { onChange, value }, fieldState: { error } }) => (
            <FormControl label="Role" errorText={error?.message} isError={Boolean(error)}>
              <FilterableSelect
                placeholder="Select role..."
                options={roles}
                onChange={onChange}
                value={value}
                getOptionValue={(option) => option.slug}
                getOptionLabel={(option) => option.name}
                components={{ Option: RoleOption }}
              />
            </FormControl>
          )}
        />
      )}
      <Controller
        control={control}
        name="hasDeleteProtection"
        render={({ field: { onChange, value }, fieldState: { error } }) => (
          <FormControl errorText={error?.message} isError={Boolean(error)}>
            <Switch
              className="mr-2 ml-0 bg-mineshaft-400/80 shadow-inner data-[state=checked]:bg-green/80"
              containerClassName="flex-row-reverse w-fit"
              id="delete-protection-enabled"
              thumbClassName="bg-mineshaft-800"
              onCheckedChange={onChange}
              isChecked={value}
            >
              <p>Delete Protection {value ? "Enabled" : "Disabled"}</p>
            </Switch>
          </FormControl>
        )}
      />
      <div>
        <FormLabel label="Metadata" />
      </div>
      <div className="mb-3 flex flex-col space-y-2">
        {metadataFormFields.fields.map(({ id: metadataFieldId }, i) => (
          <div key={metadataFieldId} className="flex items-end space-x-2">
            <div className="grow">
              {i === 0 && <span className="text-xs text-mineshaft-400">Key</span>}
              <Controller
                control={control}
                name={`metadata.${i}.key`}
                render={({ field, fieldState: { error } }) => (
                  <FormControl
                    isError={Boolean(error?.message)}
                    errorText={error?.message}
                    className="mb-0"
                  >
                    <Input {...field} />
                  </FormControl>
                )}
              />
            </div>
            <div className="grow">
              {i === 0 && <FormLabel label="Value" className="text-xs text-mineshaft-400" />}
              <Controller
                control={control}
                name={`metadata.${i}.value`}
                render={({ field, fieldState: { error } }) => (
                  <FormControl
                    isError={Boolean(error?.message)}
                    errorText={error?.message}
                    className="mb-0"
                  >
                    <Input {...field} />
                  </FormControl>
                )}
              />
            </div>
            <IconButton
              ariaLabel="delete key"
              className="bottom-0.5 h-9"
              variant="outline_bg"
              onClick={() => metadataFormFields.remove(i)}
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
            onClick={() => metadataFormFields.append({ key: "", value: "" })}
          >
            Add Key
          </Button>
        </div>
      </div>
      <div className="flex items-center">
        <Button
          className="mr-4"
          size="sm"
          type="submit"
          isLoading={isSubmitting}
          isDisabled={isSubmitting}
        >
          {isUpdate ? "Update" : "Create"}
        </Button>
        <ModalClose asChild>
          <Button colorSchema="secondary" variant="plain">
            Cancel
          </Button>
        </ModalClose>
      </div>
    </form>
  );
};
