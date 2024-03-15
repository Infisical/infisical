import { useForm } from "react-hook-form";
import { faElementor } from "@fortawesome/free-brands-svg-icons";
import {
  faAnchorLock,
  faArrowLeft,
  faBook,
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

import { useNotificationContext } from "@app/components/context/Notifications/NotificationProvider";
import { Button, FormControl, Input } from "@app/components/v2";
import { ProjectPermissionSub } from "@app/context";
import {
  useCreateProjectUserAdditionalPrivilege,
  useGetProjectUserPrivilegeDetails,
  useUpdateProjectUserAdditionalPrivilege
} from "@app/hooks/api";

import { MultiEnvProjectPermission } from "../ProjectRoleListTab/components/ProjectRoleModifySection/MultiEnvProjectPermission";
import {
  formRolePermission2API,
  formSchema,
  rolePermission2Form,
  // rolePermission2Form,
  TFormSchema
} from "../ProjectRoleListTab/components/ProjectRoleModifySection/ProjectRoleModifySection.utils";
import { SecretRollbackPermission } from "../ProjectRoleListTab/components/ProjectRoleModifySection/SecretRollbackPermission";
import { SingleProjectPermission } from "../ProjectRoleListTab/components/ProjectRoleModifySection/SingleProjectPermission";
import { WsProjectPermission } from "../ProjectRoleListTab/components/ProjectRoleModifySection/WsProjectPermission";

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
    title: "Project Members",
    subtitle: "Project members management control",
    icon: faUser,
    formName: "member"
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
  }
] as const;

type Props = {
  onGoBack: VoidFunction;
  isIdentity?: boolean;
  privilegeId?: string;
  workspaceId: string;
  // isIdentity true -> actorId is identity Id
  // isIdentity false -> actorId is projectMembershipId
  actorId: string;
};

export const AdditionalPrivilegeForm = ({ onGoBack, privilegeId, actorId, workspaceId }: Props) => {
  const { createNotification } = useNotificationContext();
  const isNewRole = !privilegeId;

  const { data: projectUserPrivilegeDetails } = useGetProjectUserPrivilegeDetails(
    privilegeId || ""
  );

  const {
    handleSubmit,
    register,
    formState: { isSubmitting, isDirty, errors },
    setValue,
    getValues,
    control
  } = useForm<TFormSchema>({
    resolver: zodResolver(formSchema),
    values: projectUserPrivilegeDetails && {
      ...projectUserPrivilegeDetails,
      description: projectUserPrivilegeDetails.description || "",
      permissions: rolePermission2Form(projectUserPrivilegeDetails.permissions)
    }
  });

  const createProjectUserAdditionalPrivilege = useCreateProjectUserAdditionalPrivilege();
  const updateProjectUserAdditionalPrivilege = useUpdateProjectUserAdditionalPrivilege();

  const handleRoleUpdate = async (el: TFormSchema) => {
    try {
      await updateProjectUserAdditionalPrivilege.mutateAsync({
        ...el,
        permissions: formRolePermission2API(el.permissions),
        privilegeId: privilegeId as string,
        workspaceId
      });
      createNotification({ type: "success", text: "Successfully update privilege" });
      onGoBack();
    } catch (err) {
      console.log(err);
      createNotification({ type: "error", text: "Failed to update privilege" });
    }
  };

  const handleFormSubmit = async (el: TFormSchema) => {
    if (!isNewRole) {
      await handleRoleUpdate(el);
      return;
    }

    try {
      await createProjectUserAdditionalPrivilege.mutateAsync({
        ...el,
        permissions: formRolePermission2API(el.permissions),
        projectMembershipId: actorId,
        workspaceId
      });
      createNotification({ type: "success", text: "Created new privilege" });
      onGoBack();
    } catch (err) {
      console.log(err);
      createNotification({ type: "error", text: "Failed to create privilege" });
    }
  };

  return (
    <div>
      <form onSubmit={handleSubmit(handleFormSubmit)}>
        <div className="mb-2 flex items-center justify-between">
          <h1 className="text-xl font-semibold text-mineshaft-100">
            {isNewRole ? "New" : "Edit"} user additional privilege
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
          Select multiple privilege that can be granted to the user
        </p>
        <div className="flex flex-col space-y-6">
          <FormControl
            label="Name"
            helperText="Use descriptive names to clearly identify permissions"
            isRequired
            className="mb-0"
            isError={Boolean(errors?.name)}
            errorText={errors?.name?.message}
          >
            <Input {...register("name")} />
          </FormControl>
          <FormControl
            label="Slug"
            helperText="Slugs are used for API access"
            isRequired
            isError={Boolean(errors?.slug)}
            errorText={errors?.slug?.message}
          >
            <Input {...register("slug")} placeholder="biller" />
          </FormControl>
          <FormControl
            label="Description"
            helperText="A short description about this privilege"
            isError={Boolean(errors?.description)}
            errorText={errors?.description?.message}
          >
            <Input {...register("description")} />
          </FormControl>
          <div className="flex items-center justify-between border-t border-t-mineshaft-800 pt-6">
            <div>
              <h2 className="text-xl font-medium">Add Privilege</h2>
            </div>
          </div>
          <div>
            <MultiEnvProjectPermission
              getValue={getValues}
              control={control}
              setValue={setValue}
              icon={faLock}
              title="Secrets"
              subtitle="Create, modify and remove secrets, folders and secret imports"
              formName="secrets"
            />
          </div>
          <div key="permission-ws">
            <WsProjectPermission control={control} setValue={setValue} />
          </div>
          {SINGLE_PERMISSION_LIST.map(({ title, subtitle, icon, formName }) => (
            <div key={`permission-${title}`}>
              <SingleProjectPermission
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
            <SecretRollbackPermission control={control} setValue={setValue} />
          </div>
        </div>
        <div className="mt-12 flex items-center space-x-4">
          <Button type="submit" isDisabled={isSubmitting || !isDirty} isLoading={isSubmitting}>
            {isNewRole ? "Grant Privilege" : "Save Changes"}
          </Button>
          <Button onClick={onGoBack} variant="outline_bg">
            Cancel
          </Button>
        </div>
      </form>
    </div>
  );
};
