import { useState } from "react";
import { useForm } from "react-hook-form";
import { faArrowLeft, faMagnifyingGlass } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { zodResolver } from "@hookform/resolvers/zod";

import { useNotificationContext } from "@app/components/context/Notifications/NotificationProvider";
import { Button, FormControl, Input } from "@app/components/v2";
import { useOrganization } from "@app/context";
import { useCreateRole, useUpdateRole } from "@app/hooks/api";
import { TRole } from "@app/hooks/api/roles/types";

import { BillingPermission } from "./BillingPermission";
import { IncidentContactPermission } from "./IncidentContactPermission";
import { MemberPermission } from "./MemberPermission";
import {
  formRolePermission2API,
  formSchema,
  rolePermission2Form,
  TFormSchema
} from "./OrgRoleModifySection.utils";
import { RolePermission } from "./RolePermission";
import { SecretScannigPermission } from "./SecretScanningPermission";
import { SettingsPermission } from "./SettingsPermission";
import { SsoPermission } from "./SsoPermission";
import { WorkspacePermission } from "./WorkspacePermission";

type Props = {
  role?: TRole;
  onGoBack: VoidFunction;
};

export const OrgRoleModifySection = ({ role, onGoBack }: Props) => {
  const [searchPermission, setSearchPermission] = useState("");

  const isNonEditable = ["owner", "admin", "member"].includes(role?.slug || "");
  const isNewRole = !role?.slug;

  const { createNotification } = useNotificationContext();
  const { currentOrg } = useOrganization();
  const orgId = currentOrg?._id || "";
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
          Roles are used to grant access to particular resources in your organization
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
          <div className="flex justify-between items-center pt-4 border-t border-t-mineshaft-800">
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
          <div className="flex flex-col space-y-4">
            <WorkspacePermission
              isNonEditable={isNonEditable}
              control={control}
              setValue={setValue}
            />
          </div>
          <div className="flex flex-col space-y-4">
            <MemberPermission isNonEditable={isNonEditable} control={control} setValue={setValue} />
          </div>
          <div className="flex flex-col space-y-4">
            <BillingPermission
              isNonEditable={isNonEditable}
              control={control}
              setValue={setValue}
            />
          </div>
          <div className="flex flex-col space-y-4">
            <RolePermission isNonEditable={isNonEditable} control={control} setValue={setValue} />
          </div>
          <div className="flex flex-col space-y-4">
            <IncidentContactPermission
              isNonEditable={isNonEditable}
              control={control}
              setValue={setValue}
            />
          </div>
          <div className="flex flex-col space-y-4">
            <SettingsPermission
              isNonEditable={isNonEditable}
              control={control}
              setValue={setValue}
            />
          </div>
          <div className="flex flex-col space-y-4">
            <SecretScannigPermission
              isNonEditable={isNonEditable}
              control={control}
              setValue={setValue}
            />
          </div>
          <div className="flex flex-col space-y-4">
            <SsoPermission isNonEditable={isNonEditable} control={control} setValue={setValue} />
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
    </div>
  );
};
