import { useForm } from "react-hook-form";
import { faElementor } from "@fortawesome/free-brands-svg-icons";
import {
  faAnchorLock,
  faArrowLeft,
  faBook,
  faCertificate,
  faCog,
  faKey,
  faLock,
  faNetworkWired,
  faPuzzlePiece,
  faServer,
  faShield,
  faTags,
  faUser,
  faUsers
} from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { zodResolver } from "@hookform/resolvers/zod";

import { createNotification } from "@app/components/notifications";
import { Button, FormControl, Input, Spinner } from "@app/components/v2";
import { ProjectPermissionSub, useWorkspace } from "@app/context";
import {
  useCreateProjectRole,
  useGetProjectRoleBySlug,
  useUpdateProjectRole
} from "@app/hooks/api";
import { TProjectRole } from "@app/hooks/api/roles/types";

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
    title: "Secret Protect policy",
    subtitle: "Manage policies for secret protection for unauthorized secret changes",
    icon: faShield,
    formName: ProjectPermissionSub.SecretApproval
  },
  {
    title: "Roles",
    subtitle: "Role management control",
    icon: faUsers,
    formName: "role"
  },
  {
    title: "User management",
    subtitle: "Add, view and remove users from the project",
    icon: faUser,
    formName: "member"
  },
  {
    title: "Group management",
    subtitle: "Add, view and remove user groups from the project",
    icon: faUsers,
    formName: "groups"
  },
  {
    title: "Machine identity management",
    subtitle: "Add, view, update and remove (machine) identities from the project",
    icon: faServer,
    formName: "identity"
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
  },
  {
    title: "Certificate Authorities",
    subtitle: "CA management control",
    icon: faCertificate,
    formName: "certificate-authorities"
  },
  {
    title: "Certificates",
    subtitle: "Certificate management control",
    icon: faCertificate,
    formName: "certificates"
  }
] as const;

type Props = {
  roleSlug?: string;
  onGoBack: VoidFunction;
};

export const ProjectRoleModifySection = ({ roleSlug, onGoBack }: Props) => {
  const isNonEditable = ["admin", "member", "viewer", "no-access"].includes(roleSlug || "");
  const isNewRole = !roleSlug;

  const { currentWorkspace } = useWorkspace();
  const projectSlug = currentWorkspace?.slug || "";
  const { data: roleDetails, isLoading: isRoleDetailsLoading } = useGetProjectRoleBySlug(
    currentWorkspace?.slug || "",
    roleSlug as string
  );

  const {
    handleSubmit,
    register,
    formState: { isSubmitting, isDirty, errors },
    setValue,
    getValues,
    control
  } = useForm<TFormSchema>({
    values: roleDetails
      ? { ...roleDetails, permissions: rolePermission2Form(roleDetails.permissions) }
      : ({} as TProjectRole),
    resolver: zodResolver(formSchema)
  });
  const { mutateAsync: createRole } = useCreateProjectRole();
  const { mutateAsync: updateRole } = useUpdateProjectRole();

  const handleRoleUpdate = async (el: TFormSchema) => {
    if (!roleDetails?.id) return;

    try {
      await updateRole({
        id: roleDetails?.id as string,
        projectSlug,
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
        projectSlug,
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

  if (!isNewRole && isRoleDetailsLoading) {
    return (
      <div className="flex w-full items-center justify-center p-8">
        <Spinner />
      </div>
    );
  }

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
          <div className="flex items-center justify-between border-t border-t-mineshaft-800 pt-6">
            <div>
              <h2 className="text-xl font-medium">Add Permission</h2>
            </div>
          </div>
          <div>
            <MultiEnvProjectPermission
              getValue={getValues}
              isNonEditable={isNonEditable}
              control={control}
              setValue={setValue}
              icon={faLock}
              title="Secrets"
              subtitle="Create, modify and remove secrets, folders and secret imports"
              formName="secrets"
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
