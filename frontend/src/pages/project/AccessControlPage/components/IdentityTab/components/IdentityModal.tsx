import { useMemo } from "react";
import { Controller, useForm } from "react-hook-form";
import { components, OptionProps } from "react-select";
import { faCheckCircle } from "@fortawesome/free-regular-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { zodResolver } from "@hookform/resolvers/zod";
import { Link } from "@tanstack/react-router";
import { z } from "zod";

import { createNotification } from "@app/components/notifications";
import {
  Button,
  FilterableSelect,
  FormControl,
  Modal,
  ModalClose,
  ModalContent,
  Spinner
} from "@app/components/v2";
import { Badge, OrgIcon } from "@app/components/v3";
import { useOrganization, useProject } from "@app/context";
import {
  useAddIdentityToWorkspace,
  useGetIdentityMembershipOrgs,
  useGetProjectRoles,
  useGetWorkspaceIdentityMemberships
} from "@app/hooks/api";
import { UsePopUpState } from "@app/hooks/usePopUp";

const schema = z.object({
  identity: z.object({ name: z.string(), id: z.string(), isManagedByRootOrg: z.boolean() }),
  role: z.object({ name: z.string(), slug: z.string() })
});

export type FormData = z.infer<typeof schema>;

type Props = {
  popUp: UsePopUpState<["identity"]>;
  handlePopUpToggle: (popUpName: keyof UsePopUpState<["identity"]>, state?: boolean) => void;
};

const Option = ({
  isSelected,
  children,
  ...props
}: OptionProps<{ name: string; id: string; isManagedByRootOrg: boolean }>) => {
  return (
    <components.Option isSelected={isSelected} {...props}>
      <div className="flex flex-row items-center justify-between">
        <p className="truncate">{children}</p>
        {props.data.isManagedByRootOrg && (
          <Badge variant="org" className="ml-auto">
            <OrgIcon />
            Organization
          </Badge>
        )}
        {isSelected && (
          <FontAwesomeIcon className="ml-2 text-primary" icon={faCheckCircle} size="sm" />
        )}
      </div>
    </components.Option>
  );
};

const Content = ({ popUp, handlePopUpToggle }: Props) => {
  const { currentOrg } = useOrganization();
  const { projectId } = useProject();

  const organizationId = currentOrg?.id || "";

  const { data: identityMembershipOrgsData, isPending: isMembershipsLoading } =
    useGetIdentityMembershipOrgs({
      organizationId,
      limit: 20000 // TODO: this is temp to preserve functionality for larger projects, will replace with combobox in separate PR
    });
  const identityMembershipOrgs = identityMembershipOrgsData?.identityMemberships;
  const { data: identityMembershipsData } = useGetWorkspaceIdentityMemberships({
    projectId,
    limit: 20000 // TODO: this is temp to preserve functionality for larger projects, will optimize in PR referenced above
  });
  const identityMemberships = identityMembershipsData?.identityMemberships;

  const { data: roles, isPending: isRolesLoading } = useGetProjectRoles(projectId);

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
    formState: { isSubmitting }
  } = useForm<FormData>({
    resolver: zodResolver(schema)
  });

  const onFormSubmit = async ({ identity, role }: FormData) => {
    await addIdentityToWorkspaceMutateAsync({
      projectId,
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
  };

  if (isMembershipsLoading || isRolesLoading)
    return (
      <div className="flex w-full items-center justify-center py-10">
        <Spinner className="text-mineshaft-400" />
      </div>
    );

  return filteredIdentityMembershipOrgs.length ? (
    <form onSubmit={handleSubmit(onFormSubmit)}>
      <Controller
        control={control}
        name="identity"
        render={({ field: { onChange, value }, fieldState: { error } }) => (
          <FormControl label="Identity" errorText={error?.message} isError={Boolean(error)}>
            <FilterableSelect
              value={value}
              onChange={onChange}
              placeholder="Select identity..."
              options={filteredIdentityMembershipOrgs.map((membership) => ({
                ...membership.identity,
                isManagedByRootOrg: membership.identity.orgId !== currentOrg.id
              }))}
              getOptionValue={(option) => option.id}
              getOptionLabel={(option) => option.name}
              components={{
                Option
              }}
            />
          </FormControl>
        )}
      />
      <Controller
        control={control}
        name="role"
        render={({ field: { onChange, value }, fieldState: { error } }) => (
          <FormControl
            label="Role"
            errorText={error?.message}
            isError={Boolean(error)}
            className="mt-4"
          >
            <FilterableSelect
              value={value}
              onChange={onChange}
              options={roles}
              placeholder="Select role..."
              getOptionValue={(option) => option.slug}
              getOptionLabel={(option) => option.name}
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
          {popUp?.identity?.data ? "Update" : "Add"}
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
      <Link to={"/organization/access-management" as const}>
        <Button isDisabled={isRolesLoading} isLoading={isRolesLoading} variant="outline_bg">
          Create a new identity
        </Button>
      </Link>
    </div>
  );
};

export const IdentityModal = ({ popUp, handlePopUpToggle }: Props) => {
  return (
    <Modal
      isOpen={popUp?.identity?.isOpen}
      onOpenChange={(isOpen) => {
        handlePopUpToggle("identity", isOpen);
      }}
    >
      <ModalContent title="Add Identity to Project" bodyClassName="overflow-visible">
        <Content popUp={popUp} handlePopUpToggle={handlePopUpToggle} />
      </ModalContent>
    </Modal>
  );
};
