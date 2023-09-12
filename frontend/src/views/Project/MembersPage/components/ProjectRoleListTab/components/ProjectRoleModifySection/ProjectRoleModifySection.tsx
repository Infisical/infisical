import { useState } from "react";
import { useForm } from "react-hook-form";
import { faElementor } from "@fortawesome/free-brands-svg-icons";
import {
  faAnchorLock,
  faArrowLeft,
  faBook,
  faCog,
  faFolder,
  faKey,
  faLink,
  faLock,
  faMagnifyingGlass,
  faNetworkWired,
  faPuzzlePiece,
  faTags,
  faUser,
  faUsers
} from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { zodResolver } from "@hookform/resolvers/zod";

import { useNotificationContext } from "@app/components/context/Notifications/NotificationProvider";
import { Button, FormControl, Input, UpgradePlanModal } from "@app/components/v2";
import { useOrganization, useSubscription, useWorkspace } from "@app/context";
import { usePopUp } from "@app/hooks";
import { useCreateRole, useUpdateRole } from "@app/hooks/api";
import { TRole } from "@app/hooks/api/roles/types";

import { MultiEnvProjectPermission } from "./MultiEnvProjectPermission";
import {
  formRolePermission2API,
  formSchema,
  rolePermission2Form,
  TFormSchema
} from "./ProjectRoleModifySection.utils";
import { SecretRollbackPermission } from "./SecretRollbackPermission";
import { SingleProjectPermission } from "./SingleProjectPermission";
import { WsProjectPermission } from "./WsProjectPermission";

const SINGLE_PERMISSION_LIST = [
  {
    title: "Integrations",
    subtitle: "Integration management control",
    icon: faPuzzlePiece,
    formName: "integrations"
  },
  {
    title: "Roles",
    subtitle: "Role management control",
    icon: faUsers,
    formName: "role"
  },
  {
    title: "Project Members",
    subtitle: "Project members management control",
    icon: faUser,
    formName: "member"
  },
  {
    title: "Webhooks",
    subtitle: "Webhook management control",
    icon: faAnchorLock,
    formName: "webhooks"
  },
  {
    title: "Service Tokens",
    subtitle: "Token management control",
    icon: faKey,
    formName: "service-tokens"
  },
  {
    title: "Settings",
    subtitle: "Settings control",
    icon: faCog,
    formName: "settings"
  },
  {
    title: "Environments",
    subtitle: "Environment management control",
    icon: faElementor,
    formName: "environments"
  },
  {
    title: "Tags",
    subtitle: "Tag management control",
    icon: faTags,
    formName: "tags"
  },
  {
    title: "Audit Logs",
    subtitle: "Audit log management control",
    icon: faBook,
    formName: "audit-logs"
  },
  {
    title: "IP Allowlist",
    subtitle: "IP allowlist management control",
    icon: faNetworkWired,
    formName: "ip-allowlist"
  }
] as const;

type Props = {
  role?: TRole<string>;
  onGoBack: VoidFunction;
};

export const ProjectRoleModifySection = ({ role, onGoBack }: Props) => {
  const [searchPermission, setSearchPermission] = useState("");

  const { popUp, handlePopUpToggle, handlePopUpOpen } = usePopUp(["upgradePlan"] as const);

  const isNonEditable = ["admin", "member", "viewer"].includes(role?.slug || "");
  const isNewRole = !role?.slug;

  const { createNotification } = useNotificationContext();
  const { currentOrg } = useOrganization();
  const orgId = currentOrg?._id || "";
  const { currentWorkspace } = useWorkspace();
  const { subscription } = useSubscription();
  const workspaceId = currentWorkspace?._id || "";

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
  const { mutateAsync: createRole } = useCreateRole();
  const { mutateAsync: updateRole } = useUpdateRole();

  const handleRoleUpdate = async (el: TFormSchema) => {
    if (!role?._id) return;

    try {
      await updateRole({
        orgId,
        id: role?._id,
        workspaceId,
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
    if (subscription && !subscription?.rbac) {
      handlePopUpOpen("upgradePlan");
      return;
    }

    if (!isNewRole) {
      await handleRoleUpdate(el);
      return;
    }

    try {
      await createRole({
        orgId,
        workspaceId,
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
        <div className="flex justify-between mb-2 items-center">
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
          Project-level roles allow you to define permissions for resources within projects at a
          granular level
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
          <div className="flex justify-between items-center pt-6 border-t border-t-mineshaft-800">
            <div>
              <h2 className="text-xl font-medium">Add Permission</h2>
            </div>
            <div className="flex-1 max-w-md">
              <Input
                value={searchPermission}
                onChange={(e) => setSearchPermission(e.target.value)}
                leftIcon={<FontAwesomeIcon icon={faMagnifyingGlass} />}
                placeholder="Search permissions..."
              />
            </div>
          </div>
          <div>
            <MultiEnvProjectPermission
              isNonEditable={isNonEditable}
              control={control}
              setValue={setValue}
              icon={faLock}
              title="Secrets"
              subtitle="Secret management control"
              formName="secrets"
            />
          </div>
          <div>
            <MultiEnvProjectPermission
              isNonEditable={isNonEditable}
              control={control}
              setValue={setValue}
              icon={faFolder}
              title="Folders"
              subtitle="Folder management control"
              formName="folders"
            />
          </div>
          <div>
            <MultiEnvProjectPermission
              isNonEditable={isNonEditable}
              control={control}
              setValue={setValue}
              icon={faLink}
              title="Secret Imports"
              subtitle="Secret import management control"
              formName="secret-imports"
            />
          </div>
          <div key="permission-ws">
            <WsProjectPermission
              control={control}
              setValue={setValue}
              isNonEditable={isNonEditable}
            />
          </div>
          {SINGLE_PERMISSION_LIST.map(({ title, subtitle, icon, formName }) => (
            <div key={`permission-${title}`}>
              <SingleProjectPermission
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
          <div key="permission-secret-rollback">
            <SecretRollbackPermission
              control={control}
              setValue={setValue}
              isNonEditable={isNonEditable}
            />
          </div>
        </div>
        <div className="flex items-center space-x-4 mt-12">
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
      {subscription && (
        <UpgradePlanModal
          isOpen={popUp.upgradePlan.isOpen}
          onOpenChange={(isOpen) => handlePopUpToggle("upgradePlan", isOpen)}
          text={
            subscription.slug === null
              ? "You can use RBAC under an Enterprise license"
              : "You can use RBAC if you switch to Infisical's Team Plan."
          }
        />
      )}
    </div>
  );
};
