import { Controller, useForm } from "react-hook-form";
import { faClock } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { zodResolver } from "@hookform/resolvers/zod";
import { twMerge } from "tailwind-merge";
import { z } from "zod";

import { useNotificationContext } from "@app/components/context/Notifications/NotificationProvider";
import {
  Button,
  FormControl,
  IconButton,
  Input,
  Popover,
  PopoverContent,
  PopoverTrigger,
  Tag,
  Tooltip
} from "@app/components/v2";
import { usePopUp } from "@app/hooks";
import {
  useUpdateIdentityProjectAdditionalPrivilege,
  useUpdateProjectUserAdditionalPrivilege
} from "@app/hooks/api";
import { IdentityProjectAdditionalPrivilegeTemporaryMode } from "@app/hooks/api/identityProjectAdditionalPrivilege/types";
import { ProjectUserAdditionalPrivilegeTemporaryMode } from "@app/hooks/api/projectUserAdditionalPrivilege/types";

const temporaryRoleFormSchema = z.object({
  temporaryRange: z.string().min(1, "Required")
});

type TTemporaryRoleFormSchema = z.infer<typeof temporaryRoleFormSchema>;

type TTemporaryRoleFormProps = {
  privilegeId: string;
  workspaceId: string;
  isIdentity?: boolean;
  temporaryConfig?: {
    isTemporary?: boolean;
    temporaryAccessEndTime?: string | null;
    temporaryAccessStartTime?: string | null;
    temporaryRange?: string | null;
  };
};

export const AdditionalPrivilegeTemporaryAccess = ({
  temporaryConfig: defaultValues = {},
  workspaceId,
  privilegeId,
  isIdentity
}: TTemporaryRoleFormProps) => {
  const { popUp, handlePopUpToggle } = usePopUp(["setTempRole"] as const);
  const { createNotification } = useNotificationContext();
  const { control, handleSubmit } = useForm<TTemporaryRoleFormSchema>({
    resolver: zodResolver(temporaryRoleFormSchema),
    values: {
      temporaryRange: defaultValues.temporaryRange || "1h"
    }
  });
  const isTemporaryFieldValue = defaultValues.isTemporary;
  const isExpired =
    isTemporaryFieldValue && new Date() > new Date(defaultValues.temporaryAccessEndTime || "");

  const updateProjectUserAdditionalPrivilege = useUpdateProjectUserAdditionalPrivilege();
  const updateProjectIdentityAdditionalPrivilege = useUpdateIdentityProjectAdditionalPrivilege();

  const handleGrantTemporaryAccess = async (el: TTemporaryRoleFormSchema) => {
    try {
      if (isIdentity) {
        await updateProjectIdentityAdditionalPrivilege.mutateAsync({
          privilegeId: privilegeId as string,
          projectId: workspaceId,
          isTemporary: true,
          temporaryRange: el.temporaryRange,
          temporaryAccessStartTime: new Date().toISOString(),
          temporaryMode: IdentityProjectAdditionalPrivilegeTemporaryMode.Relative
        });
      } else {
        await updateProjectUserAdditionalPrivilege.mutateAsync({
          privilegeId: privilegeId as string,
          workspaceId,
          isTemporary: true,
          temporaryRange: el.temporaryRange,
          temporaryAccessStartTime: new Date().toISOString(),
          temporaryMode: ProjectUserAdditionalPrivilegeTemporaryMode.Relative
        });
      }
      createNotification({ type: "success", text: "Successfully updated access" });
      handlePopUpToggle("setTempRole");
    } catch (err) {
      console.log(err);
      createNotification({ type: "error", text: "Failed to update access" });
    }
  };

  const handleRevokeTemporaryAccess = async () => {
    try {
      if (isIdentity) {
        await updateProjectIdentityAdditionalPrivilege.mutateAsync({
          privilegeId: privilegeId as string,
          projectId: workspaceId,
          isTemporary: false
        });
      } else {
        await updateProjectUserAdditionalPrivilege.mutateAsync({
          privilegeId: privilegeId as string,
          workspaceId,
          isTemporary: false
        });
      }
      createNotification({ type: "success", text: "Successfully updated access" });
      handlePopUpToggle("setTempRole");
    } catch (err) {
      console.log(err);
      createNotification({ type: "error", text: "Failed to update access" });
    }
  };

  return (
    <Popover
      open={popUp.setTempRole.isOpen}
      onOpenChange={(isOpen) => {
        handlePopUpToggle("setTempRole", isOpen);
      }}
    >
      <PopoverTrigger>
        <IconButton ariaLabel="role-temp" size="sm" variant="outline_bg">
          <Tooltip content={isExpired ? "Timed access expired" : "Grant timed access"}>
            <FontAwesomeIcon
              icon={faClock}
              className={twMerge(
                isTemporaryFieldValue && "text-primary",
                isExpired && "text-red-600"
              )}
            />
          </Tooltip>
        </IconButton>
      </PopoverTrigger>
      <PopoverContent
        arrowClassName="fill-gray-600"
        side="right"
        sideOffset={12}
        hideCloseBtn
        className="border border-gray-600 pt-4"
      >
        <div className="flex flex-col space-y-4">
          <div className="border-b border-b-gray-700 pb-2 text-sm text-mineshaft-300">
            Configure timed access
          </div>
          {isExpired && <Tag colorSchema="red">Expired</Tag>}
          <Controller
            control={control}
            name="temporaryRange"
            render={({ field, fieldState: { error } }) => (
              <FormControl
                label="Validity"
                isError={Boolean(error?.message)}
                errorText={error?.message}
                helperText={
                  <span>
                    1m, 2h, 3d.{" "}
                    <a
                      href="https://github.com/vercel/ms?tab=readme-ov-file#examples"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-primary-700"
                    >
                      More
                    </a>
                  </span>
                }
              >
                <Input {...field} />
              </FormControl>
            )}
          />
          <div className="flex items-center space-x-2">
            <Button
              size="xs"
              isLoading={
                updateProjectUserAdditionalPrivilege.isLoading &&
                updateProjectUserAdditionalPrivilege.variables?.isTemporary
              }
              isDisabled={
                updateProjectUserAdditionalPrivilege.isLoading &&
                updateProjectUserAdditionalPrivilege.variables?.isTemporary
              }
              onClick={() => {
                handleSubmit(({ temporaryRange }) => {
                  handleGrantTemporaryAccess({ temporaryRange });
                })();
              }}
            >
              {isTemporaryFieldValue ? "Restart" : "Grant access"}
            </Button>
            {isTemporaryFieldValue && (
              <Button
                size="xs"
                variant="outline_bg"
                colorSchema="danger"
                onClick={handleRevokeTemporaryAccess}
                isLoading={
                  updateProjectUserAdditionalPrivilege.isLoading &&
                  !updateProjectUserAdditionalPrivilege.variables?.isTemporary
                }
                isDisabled={
                  updateProjectUserAdditionalPrivilege.isLoading &&
                  !updateProjectUserAdditionalPrivilege.variables?.isTemporary
                }
              >
                Revoke Access
              </Button>
            )}
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
};
