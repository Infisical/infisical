import { useEffect, useMemo } from "react";
import { Controller, useForm } from "react-hook-form";
import Link from "next/link";
import { yupResolver } from "@hookform/resolvers/yup";
import * as yup from "yup";

import { createNotification } from "@app/components/notifications";
import { Button, FormControl, Modal, ModalClose, ModalContent } from "@app/components/v2";
import { ComboBox } from "@app/components/v2/ComboBox";
import { useOrganization, useWorkspace } from "@app/context";
import {
  useAddIdentityToWorkspace,
  useGetIdentityMembershipOrgs,
  useGetProjectRoles,
  useGetWorkspaceIdentityMemberships
} from "@app/hooks/api";
import { UsePopUpState } from "@app/hooks/usePopUp";

const schema = yup
  .object({
    identity: yup.object({
      id: yup.string().required("Identity id is required"),
      name: yup.string().required("Identity name is required")
    }),
    role: yup.object({
      slug: yup.string().required("role slug is required"),
      name: yup.string().required("role name is required")
    })
  })
  .required();

export type FormData = yup.InferType<typeof schema>;

type Props = {
  popUp: UsePopUpState<["identity"]>;
  handlePopUpToggle: (popUpName: keyof UsePopUpState<["identity"]>, state?: boolean) => void;
};

export const IdentityModal = ({ popUp, handlePopUpToggle }: Props) => {
  const { currentOrg } = useOrganization();
  const { currentWorkspace } = useWorkspace();

  const organizationId = currentOrg?.id || "";
  const workspaceId = currentWorkspace?.id || "";
  const projectSlug = currentWorkspace?.slug || "";

  const { data: identityMembershipOrgsData } = useGetIdentityMembershipOrgs({
    organizationId,
    limit: 20000 // TODO: this is temp to preserve functionality for bitcoindepot, will replace with combobox in separate PR
  });
  const identityMembershipOrgs = identityMembershipOrgsData?.identityMemberships;
  const { data: identityMembershipsData } = useGetWorkspaceIdentityMemberships({
    workspaceId,
    limit: 20000 // TODO: this is temp to preserve functionality for bitcoindepot, will optimize in PR referenced above
  });
  const identityMemberships = identityMembershipsData?.identityMemberships;

  const {
    data: roles,
    isLoading: isRolesLoading,
    isFetched: isRolesFetched
  } = useGetProjectRoles(projectSlug);

  const { mutateAsync: addIdentityToWorkspaceMutateAsync } = useAddIdentityToWorkspace();

  const filteredIdentityMembershipOrgs = useMemo(() => {
    const wsIdentityIds = new Map();

    identityMemberships?.forEach((identityMembership) => {
      wsIdentityIds.set(identityMembership.identity.id, true);
    });

    return (identityMembershipOrgs || []).filter(({ identity: i }) => !wsIdentityIds.has(i.id));
  }, [identityMembershipOrgs, identityMemberships]);

  const {
    control,
    handleSubmit,
    reset,
    setValue,
    formState: { isSubmitting }
  } = useForm<FormData>({
    resolver: yupResolver(schema)
  });

  useEffect(() => {
    if (!isRolesFetched || !roles) return;

    setValue("role", { name: roles[0]?.name, slug: roles[0]?.slug });
  }, [isRolesFetched, roles]);

  const onFormSubmit = async ({ identity, role }: FormData) => {
    try {
      await addIdentityToWorkspaceMutateAsync({
        workspaceId,
        identityId: identity.id,
        role: role.slug || undefined
      });

      createNotification({
        text: "Successfully added identity to project",
        type: "success"
      });

      const nextAvailableMembership = filteredIdentityMembershipOrgs.filter(
        (membership) => membership.identity.id !== identity.id
      )[0];

      // prevents combobox from displaying previously added identity
      reset({
        identity: {
          name: nextAvailableMembership?.identity.name,
          id: nextAvailableMembership?.identity.id
        }
      });
      handlePopUpToggle("identity", false);
    } catch (err) {
      console.error(err);
      const error = err as any;
      const text = error?.response?.data?.message ?? "Failed to add identity to project";

      createNotification({
        text,
        type: "error"
      });
    }
  };

  return (
    <Modal
      isOpen={popUp?.identity?.isOpen}
      onOpenChange={(isOpen) => {
        handlePopUpToggle("identity", isOpen);
        reset();
      }}
    >
      <ModalContent title="Add Identity to Project" bodyClassName="overflow-visible">
        {filteredIdentityMembershipOrgs.length ? (
          <form onSubmit={handleSubmit(onFormSubmit)}>
            <Controller
              control={control}
              name="identity"
              defaultValue={{
                id: filteredIdentityMembershipOrgs?.[0]?.identity?.id,
                name: filteredIdentityMembershipOrgs?.[0]?.identity?.name
              }}
              render={({ field: { onChange, ...field }, fieldState: { error } }) => (
                <FormControl label="Identity" errorText={error?.message} isError={Boolean(error)}>
                  <ComboBox
                    className="w-full"
                    by="id"
                    value={{ id: field.value.id, name: field.value.name }}
                    defaultValue={{ id: field.value.id, name: field.value.name }}
                    onSelectChange={(value) => onChange({ id: value.id, name: value.name })}
                    displayValue={(el) => el.name}
                    onFilter={({ value }, filterQuery) =>
                      value.name.toLowerCase().includes(filterQuery.toLowerCase())
                    }
                    items={filteredIdentityMembershipOrgs.map(({ identity }) => ({
                      key: identity.id,
                      value: { id: identity.id, name: identity.name },
                      label: identity.name
                    }))}
                  />
                </FormControl>
              )}
            />
            <Controller
              control={control}
              name="role"
              defaultValue={{ name: "", slug: "" }}
              render={({ field: { onChange, ...field }, fieldState: { error } }) => (
                <FormControl
                  label="Role"
                  errorText={error?.message}
                  isError={Boolean(error)}
                  className="mt-4"
                >
                  <ComboBox
                    className="w-full"
                    by="slug"
                    value={{ slug: field.value.slug, name: field.value.name }}
                    defaultValue={{ slug: field.value.slug, name: field.value.name }}
                    onSelectChange={(value) => onChange({ slug: value.slug, name: value.name })}
                    displayValue={(el) => el.name}
                    onFilter={({ value }, filterQuery) =>
                      value.name.toLowerCase().includes(filterQuery.toLowerCase())
                    }
                    items={(roles || []).map(({ slug, name }) => ({
                      key: slug,
                      value: { slug, name },
                      label: name
                    }))}
                  />
                </FormControl>
              )}
            />
            <div className="flex items-center">
              <Button
                className="mr-4"
                size="sm"
                type="submit"
                isLoading={isSubmitting}
                isDisabled={isSubmitting}
              >
                {popUp?.identity?.data ? "Update" : "Create"}
              </Button>
              <ModalClose asChild>
                <Button colorSchema="secondary" variant="plain">
                  Cancel
                </Button>
              </ModalClose>
            </div>
          </form>
        ) : (
          <div className="flex flex-col space-y-4">
            <div className="text-sm">
              All identities in your organization have already been added to this project.
            </div>
            <Link href={`/org/${currentWorkspace?.orgId}/members`}>
              <Button isDisabled={isRolesLoading} isLoading={isRolesLoading} variant="outline_bg">
                Create a new identity
              </Button>
            </Link>
          </div>
        )}
      </ModalContent>
    </Modal>
  );
};
