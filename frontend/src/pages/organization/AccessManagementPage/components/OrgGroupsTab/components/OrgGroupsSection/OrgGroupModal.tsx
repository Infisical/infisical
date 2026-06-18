import { useEffect } from "react";
import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { InfoIcon } from "lucide-react";
import { z } from "zod";

import { createNotification } from "@app/components/notifications";
import { RoleOption } from "@app/components/roles";
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Field,
  FieldError,
  FieldLabel,
  FilterableSelect,
  Input,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
  Tooltip,
  TooltipContent,
  TooltipTrigger
} from "@app/components/v3";
import { useOrganization } from "@app/context";
import { findOrgMembershipRole } from "@app/helpers/roles";
import { useCreateGroup, useGetOrgRoles, useUpdateGroup } from "@app/hooks/api";
import { UsePopUpState } from "@app/hooks/usePopUp";

import { GroupWizardSteps } from "./groupWizardSteps";
import { OrgGroupLinkForm } from "./OrgGroupLinkForm";

const GroupFormSchema = z.object({
  name: z.string().min(1, "Name cannot be empty").max(255, "Name must be 255 characters or fewer"),
  slug: z
    .string()
    .min(5, "Slug must be at least 5 characters long")
    .max(255, "Slug must be 255 characters or fewer")
    .regex(/^[a-z0-9-]+$/, "Slug can only contain lowercase letters, numbers, and hyphens"),
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

  let modalTitle = "Create Group";
  if (!isCreateMode) modalTitle = "Update Group";
  else if (isSubOrganization) modalTitle = "Add Group to Sub-Organization";

  const createGroupForm = (
    <form onSubmit={handleSubmit(onGroupModalSubmit)} className="flex flex-col gap-4">
      <Controller
        control={control}
        name="name"
        render={({ field, fieldState: { error } }) => (
          <Field>
            <FieldLabel htmlFor="name">Name</FieldLabel>
            <Input id="name" placeholder="Engineering" isError={Boolean(error)} {...field} />
            <FieldError>{error?.message}</FieldError>
          </Field>
        )}
      />
      <Controller
        control={control}
        name="slug"
        render={({ field, fieldState: { error } }) => (
          <Field>
            <FieldLabel htmlFor="slug">Slug</FieldLabel>
            <Input id="slug" placeholder="engineering" isError={Boolean(error)} {...field} />
            <FieldError>{error?.message}</FieldError>
          </Field>
        )}
      />
      <Controller
        control={control}
        name="role"
        render={({ field: { onChange, value }, fieldState: { error } }) => (
          <Field>
            <FieldLabel htmlFor="role">{isCreateMode ? "Role" : "Update Role"}</FieldLabel>
            <FilterableSelect
              inputId="role"
              options={roles}
              placeholder="Select role..."
              onChange={onChange}
              value={value}
              isError={Boolean(error)}
              getOptionValue={(option) => option.slug}
              getOptionLabel={(option) => option.name}
              components={{ Option: RoleOption }}
            />
            <FieldError>{error?.message}</FieldError>
          </Field>
        )}
      />
      <DialogFooter>
        <Button variant="ghost" type="button" onClick={() => handlePopUpClose("group")}>
          Cancel
        </Button>
        <Button
          variant="org"
          type="submit"
          isPending={createIsLoading || updateIsLoading}
          isDisabled={createIsLoading || updateIsLoading}
        >
          {isCreateMode ? "Create" : "Update"}
        </Button>
      </DialogFooter>
    </form>
  );

  return (
    <Dialog
      open={popUp?.group?.isOpen}
      onOpenChange={(isOpen) => {
        handlePopUpToggle("group", isOpen);
        if (!isOpen) {
          setWizardStep(GroupWizardSteps.CreateGroup);
          reset();
        }
      }}
    >
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{modalTitle}</DialogTitle>
          {showToggle && (
            <DialogDescription>
              Create a new group or assign an existing one from the parent organization
            </DialogDescription>
          )}
        </DialogHeader>

        {showToggle ? (
          <Tabs
            value={wizardStep}
            onValueChange={(value) => setWizardStep(value as GroupWizardSteps)}
          >
            <div className="flex items-center justify-center gap-2">
              <TabsList>
                <TabsTrigger value={GroupWizardSteps.CreateGroup}>Create New</TabsTrigger>
                <TabsTrigger value={GroupWizardSteps.LinkGroup}>Assign Existing</TabsTrigger>
              </TabsList>
              <Tooltip>
                <TooltipTrigger asChild>
                  <span className="inline-flex cursor-default text-mineshaft-400">
                    <InfoIcon size={16} />
                  </span>
                </TooltipTrigger>
                <TooltipContent side="right" className="max-w-sm">
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
                </TooltipContent>
              </Tooltip>
            </div>
            <TabsContent value={GroupWizardSteps.CreateGroup}>{createGroupForm}</TabsContent>
            <TabsContent value={GroupWizardSteps.LinkGroup}>
              <OrgGroupLinkForm
                onClose={() => {
                  handlePopUpClose("group");
                  setWizardStep(GroupWizardSteps.CreateGroup);
                }}
              />
            </TabsContent>
          </Tabs>
        ) : (
          createGroupForm
        )}
      </DialogContent>
    </Dialog>
  );
};
