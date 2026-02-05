import { useEffect } from "react";
import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { InfoIcon } from "lucide-react";
import { twMerge } from "tailwind-merge";
import { z } from "zod";

import { createNotification } from "@app/components/notifications";
import {
  Button,
  FilterableSelect,
  FormControl,
  Input,
  Modal,
  ModalContent,
  Tooltip
} from "@app/components/v2";
import { useOrganization } from "@app/context";
import { findOrgMembershipRole } from "@app/helpers/roles";
import { useCreateGroup, useGetOrgRoles, useUpdateGroup } from "@app/hooks/api";
import { UsePopUpState } from "@app/hooks/usePopUp";

import { GroupWizardSteps } from "./groupWizardSteps";
import { OrgGroupLinkForm } from "./OrgGroupLinkForm";

const GroupFormSchema = z.object({
  name: z.string().min(1, "Name cannot be empty").max(50, "Name must be 50 characters or fewer"),
  slug: z
    .string()
    .min(5, "Slug must be at least 5 characters long")
    .max(36, "Slug must be 36 characters or fewer"),
  role: z.object({ name: z.string(), slug: z.string() })
});

export type TGroupFormData = z.infer<typeof GroupFormSchema>;

type Props = {
  popUp: UsePopUpState<["group"]>;
  handlePopUpClose: (popUpName: keyof UsePopUpState<["group"]>) => void;
  handlePopUpToggle: (popUpName: keyof UsePopUpState<["group"]>, state?: boolean) => void;
  wizardStep: GroupWizardSteps;
  setWizardStep: (step: GroupWizardSteps) => void;
  isSubOrganization: boolean;
};

export const OrgGroupModal = ({
  popUp,
  handlePopUpClose,
  handlePopUpToggle,
  wizardStep,
  setWizardStep,
  isSubOrganization
}: Props) => {
  const { currentOrg } = useOrganization();
  const { data: roles } = useGetOrgRoles(currentOrg?.id || "");
  const { mutateAsync: createMutateAsync, isPending: createIsLoading } = useCreateGroup();
  const { mutateAsync: updateMutateAsync, isPending: updateIsLoading } = useUpdateGroup();

  const { control, handleSubmit, reset } = useForm<TGroupFormData>({
    resolver: zodResolver(GroupFormSchema)
  });

  useEffect(() => {
    const group = popUp?.group?.data as {
      groupId: string;
      name: string;
      slug: string;
      role: string;
      customRole: {
        name: string;
        slug: string;
      };
    };

    if (!roles?.length) return;

    if (group) {
      reset({
        name: group.name,
        slug: group.slug,
        role: group?.customRole ?? findOrgMembershipRole(roles, group.role)
      });
    } else {
      reset({
        name: "",
        slug: "",
        role: findOrgMembershipRole(roles, currentOrg!.defaultMembershipRole)
      });
    }
  }, [popUp?.group?.data, roles]);

  const onGroupModalSubmit = async ({ name, slug, role }: TGroupFormData) => {
    if (!currentOrg?.id) return;

    const group = popUp?.group?.data as {
      groupId: string;
      name: string;
      slug: string;
    };

    if (group) {
      await updateMutateAsync({
        id: group.groupId,
        name,
        slug,
        role: role.slug || undefined
      });
    } else {
      await createMutateAsync({
        name,
        slug,
        organizationId: currentOrg.id,
        role: role.slug || undefined
      });
    }
    handlePopUpToggle("group", false);
    reset();

    createNotification({
      text: `Successfully ${popUp?.group?.data ? "updated" : "created"} group`,
      type: "success"
    });
  };

  const isCreateMode = !popUp?.group?.data;
  const showToggle = isSubOrganization && isCreateMode;

  const modalTitle = (() => {
    if (!isCreateMode) return "Update Group";
    if (isSubOrganization) return "Add Group to Sub-Organization";
    return "Create Group";
  })();

  return (
    <Modal
      isOpen={popUp?.group?.isOpen}
      onOpenChange={(isOpen) => {
        handlePopUpToggle("group", isOpen);
        if (!isOpen) {
          setWizardStep(GroupWizardSteps.CreateGroup);
          reset();
        }
      }}
    >
      <ModalContent
        bodyClassName="overflow-visible"
        title={modalTitle}
        subTitle={
          showToggle
            ? "Create a new group or assign an existing one from the parent organization"
            : undefined
        }
      >
        {showToggle && (
          <div className="mb-4 flex items-center justify-center gap-x-2">
            <div className="flex w-3/4 gap-x-0.5 rounded-md border border-mineshaft-600 bg-mineshaft-800 p-1">
              <Button
                variant="outline_bg"
                onClick={() => setWizardStep(GroupWizardSteps.CreateGroup)}
                size="xs"
                className={twMerge(
                  "min-w-[2.4rem] flex-1 rounded border-none hover:bg-mineshaft-600",
                  wizardStep === GroupWizardSteps.CreateGroup
                    ? "bg-mineshaft-500"
                    : "bg-transparent"
                )}
              >
                Create New
              </Button>
              <Button
                variant="outline_bg"
                onClick={() => setWizardStep(GroupWizardSteps.LinkGroup)}
                size="xs"
                className={twMerge(
                  "min-w-[2.4rem] flex-1 rounded border-none hover:bg-mineshaft-600",
                  wizardStep === GroupWizardSteps.LinkGroup ? "bg-mineshaft-500" : "bg-transparent"
                )}
              >
                Assign Existing
              </Button>
            </div>
            <Tooltip
              className="max-w-sm"
              position="right"
              align="start"
              content={
                <>
                  <p className="mb-2 text-mineshaft-300">
                    You can add groups to your sub-organization in one of two ways:
                  </p>
                  <ul className="ml-3.5 flex list-disc flex-col gap-y-4">
                    <li className="text-mineshaft-200">
                      <strong className="text-mineshaft-100">Create New</strong> – Create a new
                      group for this sub-organization. It will be managed at the sub-organization
                      level.
                    </li>
                    <li>
                      <strong className="text-mineshaft-100">Assign Existing</strong> – Link an
                      existing group from the parent organization. The group stays managed at the
                      parent level.
                    </li>
                  </ul>
                </>
              }
            >
              <InfoIcon size={16} className="text-mineshaft-400" />
            </Tooltip>
          </div>
        )}
        {wizardStep === GroupWizardSteps.LinkGroup ? (
          <OrgGroupLinkForm
            onClose={() => {
              handlePopUpClose("group");
              setWizardStep(GroupWizardSteps.CreateGroup);
            }}
          />
        ) : (
          <form onSubmit={handleSubmit(onGroupModalSubmit)}>
            <Controller
              control={control}
              name="name"
              render={({ field, fieldState: { error } }) => (
                <FormControl label="Name" errorText={error?.message} isError={Boolean(error)}>
                  <Input {...field} placeholder="Engineering" />
                </FormControl>
              )}
            />
            <Controller
              control={control}
              name="slug"
              render={({ field, fieldState: { error } }) => (
                <FormControl label="Slug" errorText={error?.message} isError={Boolean(error)}>
                  <Input {...field} placeholder="engineering" />
                </FormControl>
              )}
            />
            <Controller
              control={control}
              name="role"
              render={({ field: { onChange, value }, fieldState: { error } }) => (
                <FormControl
                  label={`${popUp?.group?.data ? "Update" : ""} Role`}
                  errorText={error?.message}
                  isError={Boolean(error)}
                  className="mt-4"
                >
                  <FilterableSelect
                    options={roles}
                    placeholder="Select role..."
                    onChange={onChange}
                    value={value}
                    getOptionValue={(option) => option.slug}
                    getOptionLabel={(option) => option.name}
                  />
                </FormControl>
              )}
            />
            <div className="mt-8 flex items-center">
              <Button
                className="mr-4"
                size="sm"
                type="submit"
                isLoading={createIsLoading || updateIsLoading}
              >
                {!popUp?.group?.data ? "Create" : "Update"}
              </Button>
              <Button
                colorSchema="secondary"
                variant="plain"
                onClick={() => handlePopUpClose("group")}
              >
                Cancel
              </Button>
            </div>
          </form>
        )}
      </ModalContent>
    </Modal>
  );
};
