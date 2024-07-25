import { useForm } from "react-hook-form";
import {
  faArrowLeft,
  faCog,
  faContactCard,
  faMagnifyingGlass,
  faMoneyBill,
  faServer,
  faSignIn,
  faUser,
  faUserCog,
  faUsers
} from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { zodResolver } from "@hookform/resolvers/zod";

import { createNotification } from "@app/components/notifications";
import { Button, FormControl, Input } from "@app/components/v2";
import { useOrganization } from "@app/context";
import { useCreateOrgRole, useUpdateOrgRole } from "@app/hooks/api";
import { TOrgRole } from "@app/hooks/api/roles/types";

import {
  formRolePermission2API,
  formSchema,
  rolePermission2Form,
  TFormSchema
} from "./OrgRoleModifySection.utils";
import { SimpleLevelPermissionOption } from "./SimpleLevelPermissionOptions";
import { WorkspacePermission } from "./WorkspacePermission";

type Props = {
  role?: TOrgRole;
  onGoBack: VoidFunction;
};

const SIMPLE_PERMISSION_OPTIONS = [
  {
    title: "User management",
    subtitle: "Invite, view and remove users from the organization",
    icon: faUser,
    formName: "member"
  },
  {
    title: "Group management",
    subtitle: "Invite, view and remove user groups from the organization",
    icon: faUsers,
    formName: "groups"
  },
  {
    title: "Machine identity management",
    subtitle: "Create, view, update and remove (machine) identities from the organization",
    icon: faServer,
    formName: "identity"
  },
  {
    title: "Billing & usage",
    subtitle: "Modify organization subscription plan",
    icon: faMoneyBill,
    formName: "billing"
  },
  {
    title: "Role management",
    subtitle: "Create, modify and remove organization roles",
    icon: faUserCog,
    formName: "role"
  },
  {
    title: "Incident Contacts",
    subtitle: "Incident contacts management control",
    icon: faContactCard,
    formName: "incident-contact"
  },
  {
    title: "Organization profile",
    subtitle: "View & update organization metadata such as name",
    icon: faCog,
    formName: "settings"
  },
  {
    title: "Secret Scanning",
    subtitle: "Secret scanning management control",
    icon: faMagnifyingGlass,
    formName: "secret-scanning"
  },
  {
    title: "SSO",
    subtitle: "Define organization level SSO requirements",
    icon: faSignIn,
    formName: "sso"
  },
  {
    title: "LDAP",
    subtitle: "Define organization level LDAP requirements",
    icon: faSignIn,
    formName: "ldap"
  },
  {
    title: "SCIM",
    subtitle: "Define organization level SCIM requirements",
    icon: faUsers,
    formName: "scim"
  }
] as const;

export const OrgRoleModifySection = ({ role, onGoBack }: Props) => {
  const isNonEditable = ["owner", "admin", "member", "no-access"].includes(role?.slug || "");
  const isNewRole = !role?.slug;
  const { currentOrg } = useOrganization();
  const orgId = currentOrg?.id || "";
  const {
    handleSubmit,
    register,
    formState: { isSubmitting, isDirty, errors },
    setValue,
    control
  } = useForm<TFormSchema>({
    defaultValues: role ? { ...role, permissions: rolePermission2Form(role.permissions) } : {},
    resolver: zodResolver(formSchema)
  });

  const { mutateAsync: createRole } = useCreateOrgRole();
  const { mutateAsync: updateRole } = useUpdateOrgRole();

  const handleRoleUpdate = async (el: TFormSchema) => {
    if (!role?.id) return;

    try {
      await updateRole({
        orgId,
        id: role?.id,
        ...el,
        permissions: formRolePermission2API(el.permissions)
      });
      createNotification({ type: "success", text: "Successfully updated role" });
      onGoBack();
    } catch (err) {
      console.log(err);
      createNotification({ type: "error", text: "Failed to update role" });
    }
  };

  const handleFormSubmit = async (el: TFormSchema) => {
    if (!isNewRole) {
      await handleRoleUpdate(el);
      return;
    }

    try {
      await createRole({
        orgId,
        ...el,
        permissions: formRolePermission2API(el.permissions)
      });
      createNotification({ type: "success", text: "Created new role" });
      onGoBack();
    } catch (err) {
      console.log(err);
      createNotification({ type: "error", text: "Failed to create role" });
    }
  };

  return (
    <div>
      <form onSubmit={handleSubmit(handleFormSubmit)}>
        <div className="mb-2 flex items-center justify-between">
          <h1 className="text-xl font-semibold text-mineshaft-100">
            {isNewRole ? "New" : "Edit"} Role
          </h1>
          <Button
            onClick={onGoBack}
            variant="outline_bg"
            leftIcon={<FontAwesomeIcon icon={faArrowLeft} />}
          >
            Go back
          </Button>
        </div>
        <p className="mb-8 text-gray-400">
          Organization-level roles allow you to define permissions for resources at a high level
          across the organization
        </p>
        <div className="flex flex-col space-y-6">
          <FormControl
            label="Name"
            isRequired
            className="mb-0"
            isError={Boolean(errors?.name)}
            errorText={errors?.name?.message}
          >
            <Input {...register("name")} placeholder="Billing Team" isReadOnly={isNonEditable} />
          </FormControl>
          <FormControl
            label="Slug"
            isRequired
            isError={Boolean(errors?.slug)}
            errorText={errors?.slug?.message}
          >
            <Input {...register("slug")} placeholder="biller" isReadOnly={isNonEditable} />
          </FormControl>
          <FormControl
            label="Description"
            helperText="A short description about this role"
            isError={Boolean(errors?.description)}
            errorText={errors?.description?.message}
          >
            <Input {...register("description")} isReadOnly={isNonEditable} />
          </FormControl>
          <div className="flex items-center justify-between border-t border-t-mineshaft-800 pt-6">
            <div>
              <h2 className="text-xl font-medium">Add Permission</h2>
            </div>
          </div>
          <div className="">
            <WorkspacePermission
              isNonEditable={isNonEditable}
              control={control}
              setValue={setValue}
            />
          </div>
          {SIMPLE_PERMISSION_OPTIONS.map(({ title, subtitle, icon, formName }) => (
            <div key={`permission-${title}`}>
              <SimpleLevelPermissionOption
                isNonEditable={isNonEditable}
                control={control}
                setValue={setValue}
                icon={icon}
                title={title}
                subtitle={subtitle}
                formName={formName}
              />
            </div>
          ))}
        </div>
        <div className="mt-12 flex items-center space-x-4">
          <Button
            type="submit"
            isDisabled={isSubmitting || isNonEditable || !isDirty}
            isLoading={isSubmitting}
          >
            {isNewRole ? "Create Role" : "Save Role"}
          </Button>
          <Button onClick={onGoBack} variant="outline_bg">
            Cancel
          </Button>
        </div>
      </form>
    </div>
  );
};
