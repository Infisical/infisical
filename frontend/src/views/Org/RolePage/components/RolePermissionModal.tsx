import { useEffect } from "react";
import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";

import { createNotification } from "@app/components/notifications";
import {
  Button,
  Checkbox,
  FormControl,
  Modal,
  ModalContent,
  Select,
  SelectItem
} from "@app/components/v2";
import { useOrganization } from "@app/context";
import { useGetOrgRole } from "@app/hooks/api";
import { UsePopUpState } from "@app/hooks/usePopUp";

enum Permission {
  NoAccess = "no-access",
  ReadOnly = "read-only",
  FullAccess = "full-acess",
  Custom = "custom"
}

const generalPermissionSchema = z
  .object({
    read: z.boolean().optional(),
    edit: z.boolean().optional(),
    delete: z.boolean().optional(),
    create: z.boolean().optional()
  })
  .optional();

const specificPermissionSchemas = {
  workspace: z
    .object({
      read: z.boolean().optional(),
      create: z.boolean().optional()
    })
    .optional(),
  member: generalPermissionSchema,
  groups: generalPermissionSchema,
  role: generalPermissionSchema,
  settings: generalPermissionSchema,
  "service-account": generalPermissionSchema,
  "incident-contact": generalPermissionSchema,
  "secret-scanning": generalPermissionSchema,
  sso: generalPermissionSchema,
  scim: generalPermissionSchema,
  ldap: generalPermissionSchema,
  billing: generalPermissionSchema,
  identity: generalPermissionSchema
};

// Create a union of all possible keys
const permissionsUnion = z.union([
  z.object({ workspace: specificPermissionSchemas.workspace }),
  z.object({ member: specificPermissionSchemas.member }),
  z.object({ groups: specificPermissionSchemas.groups }),
  z.object({ role: specificPermissionSchemas.role }),
  z.object({ settings: specificPermissionSchemas.settings }),
  z.object({ "service-account": specificPermissionSchemas["service-account"] }),
  z.object({ "incident-contact": specificPermissionSchemas["incident-contact"] }),
  z.object({ "secret-scanning": specificPermissionSchemas["secret-scanning"] }),
  z.object({ sso: specificPermissionSchemas.sso }),
  z.object({ scim: specificPermissionSchemas.scim }),
  z.object({ ldap: specificPermissionSchemas.ldap }),
  z.object({ billing: specificPermissionSchemas.billing }),
  z.object({ identity: specificPermissionSchemas.identity })
]);

const schema = z.object({
  resource: z.string(), // this is formName
  action: z.nativeEnum(Permission),
  permissions: z.record(z.string(), permissionsUnion).optional()
});

type FormData = z.infer<typeof schema>;

type Props = {
  roleId: string;
  popUp: UsePopUpState<["rolePermission"]>;
  handlePopUpToggle: (popUpName: keyof UsePopUpState<["rolePermission"]>, state?: boolean) => void;
};

const SIMPLE_PERMISSION_OPTIONS = [
  {
    title: "User management",
    formName: "member"
  },
  {
    title: "Group management",
    formName: "groups"
  },
  {
    title: "Machine identity management",
    formName: "identity"
  },
  {
    title: "Billing & usage",
    formName: "billing"
  },
  {
    title: "Role management",
    formName: "role"
  },
  {
    title: "Incident Contacts",
    formName: "incident-contact"
  },
  {
    title: "Organization profile",
    formName: "settings"
  },
  {
    title: "Secret Scanning",
    formName: "secret-scanning"
  },
  {
    title: "SSO",
    formName: "sso"
  },
  {
    title: "LDAP",
    formName: "ldap"
  },
  {
    title: "SCIM",
    formName: "scim"
  }
] as const;

const PERMISSIONS = [
  { action: "read", label: "View" },
  { action: "create", label: "Create" },
  { action: "edit", label: "Modify" },
  { action: "delete", label: "Remove" }
] as const;

const SECRET_SCANNING_PERMISSIONS = [
  { action: "read", label: "View risks" },
  { action: "create", label: "Add integrations" },
  { action: "edit", label: "Edit risk status" },
  { action: "delete", label: "Remove integrations" }
] as const;

const INCIDENT_CONTACTS_PERMISSIONS = [
  { action: "read", label: "View contacts" },
  { action: "create", label: "Add new contacts" },
  { action: "edit", label: "Edit contacts" },
  { action: "delete", label: "Remove contacts" }
] as const;

const MEMBERS_PERMISSIONS = [
  { action: "read", label: "View all members" },
  { action: "create", label: "Invite members" },
  { action: "edit", label: "Edit members" },
  { action: "delete", label: "Remove members" }
] as const;

const BILLING_PERMISSIONS = [
  { action: "read", label: "View bills" },
  { action: "create", label: "Add payment methods" },
  { action: "edit", label: "Edit payments" },
  { action: "delete", label: "Remove payments" }
] as const;

const getPermissionList = (option: string) => {
  switch (option) {
    case "secret-scanning":
      return SECRET_SCANNING_PERMISSIONS;
    case "billing":
      return BILLING_PERMISSIONS;
    case "incident-contact":
      return INCIDENT_CONTACTS_PERMISSIONS;
    case "member":
      return MEMBERS_PERMISSIONS;
    default:
      return PERMISSIONS;
  }
};

export const RolePermissionModal = ({ roleId, popUp, handlePopUpToggle }: Props) => {
  const { currentOrg } = useOrganization();
  const orgId = currentOrg?.id || "";
  const { data: role } = useGetOrgRole(orgId, roleId);

  const {
    control,
    handleSubmit,
    reset,
    formState: { isSubmitting },
    watch
  } = useForm<FormData>({
    resolver: zodResolver(schema)
  });

  const resource = watch("resource");
  const action = watch("action");

  useEffect(() => {
    reset({
      resource: SIMPLE_PERMISSION_OPTIONS[0].formName,
      action: Permission.NoAccess
    });

    // TODO: update for existing permission

    // if (role) {
    //   console.log("existing role found: ", role);
    //   reset({
    //     resource: SIMPLE_PERMISSION_OPTIONS[0].formName
    //   });
    // } else {
    //   console.log("no role found");
    //   reset({
    //     resource: SIMPLE_PERMISSION_OPTIONS[0].formName
    //   });
    // }
  }, [role]);

  const onFormSubmit = async () => {
    try {
      // TODO: map action to permission array?

      // TODO: add permission to role

      //   await addIdentityToWorkspace({
      //     workspaceId,
      //     identityId,
      //     role: role || undefined
      //   });

      createNotification({
        text: "Successfully added permission to role",
        type: "success"
      });

      //   reset();
      //   handlePopUpToggle("rolePermission", false);
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
      isOpen={popUp?.rolePermission?.isOpen}
      onOpenChange={(isOpen) => {
        handlePopUpToggle("rolePermission", isOpen);
        reset();
      }}
    >
      <ModalContent title="Add Permission to Role">
        <form onSubmit={handleSubmit(onFormSubmit)}>
          <Controller
            control={control}
            name="resource"
            defaultValue=""
            render={({ field: { onChange, ...field }, fieldState: { error } }) => (
              <FormControl label="Resource" errorText={error?.message} isError={Boolean(error)}>
                <Select
                  defaultValue={field.value}
                  {...field}
                  onValueChange={(e) => onChange(e)}
                  className="w-full"
                >
                  {SIMPLE_PERMISSION_OPTIONS.map(({ title, formName }) => (
                    <SelectItem value={formName} key={`resource-${title}`}>
                      {title}
                    </SelectItem>
                  ))}
                </Select>
              </FormControl>
            )}
          />
          <Controller
            control={control}
            name="action"
            render={({ field: { onChange, ...field }, fieldState: { error } }) => (
              <FormControl label="Action" errorText={error?.message} isError={Boolean(error)}>
                <Select
                  defaultValue={field.value}
                  {...field}
                  onValueChange={(e) => onChange(e)}
                  className="w-full"
                >
                  <SelectItem value={Permission.NoAccess}>No Access</SelectItem>
                  <SelectItem value={Permission.ReadOnly}>Read Only</SelectItem>
                  <SelectItem value={Permission.FullAccess}>Full Access</SelectItem>
                  <SelectItem value={Permission.Custom}>Custom</SelectItem>
                </Select>
              </FormControl>
            )}
          />
          {action === Permission.Custom && (
            <div className="mt-8 mb-4 grid grid-cols-3 gap-4">
              {getPermissionList(watch("resource")).map((p) => {
                return (
                  <Controller
                    name={`permissions.${resource}.${p.action}`}
                    key={`permissions.${resource}.${p.action}`}
                    control={control}
                    render={({ field }) => (
                      <Checkbox
                        isChecked
                        onCheckedChange={field.onChange}
                        id={`permissions.${resource}.${p.action}`}
                        isDisabled={false}
                      >
                        {p.label}
                      </Checkbox>
                    )}
                  />
                );
              })}
            </div>
          )}
          <div className="mt-8 flex items-center">
            <Button
              className="mr-4"
              size="sm"
              type="submit"
              isLoading={isSubmitting}
              isDisabled={isSubmitting}
            >
              Add
            </Button>
            <Button
              colorSchema="secondary"
              variant="plain"
              onClick={() => handlePopUpToggle("rolePermission", false)}
            >
              Cancel
            </Button>
          </div>
        </form>
      </ModalContent>
    </Modal>
  );
};
