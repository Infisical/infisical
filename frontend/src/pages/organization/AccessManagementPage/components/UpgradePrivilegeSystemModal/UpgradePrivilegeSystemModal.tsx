import { Controller, useForm } from "react-hook-form";
import {
  faCheck,
  faCircleInfo,
  faExclamationTriangle,
  faWarning
} from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";

import { createNotification } from "@app/components/notifications";
import { Button, Checkbox, Modal, ModalContent } from "@app/components/v2";
import { useOrgPermission } from "@app/context";
import { useUpgradePrivilegeSystem } from "@app/hooks/api";

const formSchema = z.object({
  isProjectPrivilegesUpdated: z.literal(true),
  isOrgPrivilegesUpdated: z.literal(true),
  isInfrastructureUpdated: z.literal(true),
  acknowledgesPermanentChange: z.literal(true)
});

type Props = {
  isOpen?: boolean;
  onOpenChange: (isOpen: boolean) => void;
};

export const UpgradePrivilegeSystemModal = ({ isOpen, onOpenChange }: Props) => {
  const { membership } = useOrgPermission();

  const {
    handleSubmit,
    control,
    formState: { isSubmitting }
  } = useForm({ resolver: zodResolver(formSchema) });
  const { mutateAsync: upgradePrivilegeSystem } = useUpgradePrivilegeSystem();

  const handlePrivilegeSystemUpgrade = async () => {
    try {
      await upgradePrivilegeSystem();

      createNotification({
        text: "Privilege system upgrade completed",
        type: "success"
      });

      onOpenChange(false);
    } catch {
      createNotification({
        text: "Failed to upgrade privilege system",
        type: "error"
      });
    }
  };

  const isAdmin = membership?.role === "admin";

  return (
    <Modal isOpen={isOpen} onOpenChange={onOpenChange}>
      <ModalContent title="Privilege Management System Upgrade">
        <div className="mb-4">
          <h4 className="mb-2 text-lg font-semibold">
            Introducing Permission-Based Privilege Management
          </h4>
          <p className="mb-4 leading-7 text-mineshaft-100">
            We've developed an improved privilege management system that enhances how access
            controls work in your organization.
          </p>

          <div className="mb-4 rounded-lg border border-mineshaft-600 bg-mineshaft-800 p-4">
            <div className="mb-3">
              <div className="mb-2 flex items-start gap-2">
                <FontAwesomeIcon icon={faCircleInfo} className="mt-1 text-primary" />
                <p className="font-medium">How it works:</p>
              </div>
              <div className="mb-3 ml-7">
                <p className="mb-1">
                  <strong>Legacy system:</strong> Users with higher privilege levels could modify
                  access for anyone below them.
                </p>
                <p>
                  <strong>New system:</strong> Users need explicit permission to modify specific
                  access levels, providing targeted control. After upgrading, you'll need to grant
                  the new 'Manage Privileges' permission at organization or project level.
                </p>
              </div>
            </div>

            <div>
              <div className="mb-2 flex items-start gap-2">
                <FontAwesomeIcon icon={faCheck} className="mt-1 text-primary" />
                <p className="font-medium">Benefits:</p>
              </div>
              <div className="ml-7">
                <ul className="list-disc pl-5">
                  <li>More granular control over who can modify access levels</li>
                  <li>Improved security through precise permission checks</li>
                </ul>
              </div>
            </div>
          </div>

          <p className="mb-4 leading-7 text-mineshaft-100">
            This upgrade affects operations like updating roles, managing group memberships, and
            modifying privileges across your organization and projects.
          </p>
        </div>
        <div className="mt-6 flex max-w-2xl flex-col rounded-lg border border-primary/50 bg-primary/10 px-6 py-5">
          <div className="mb-4 flex items-start gap-2">
            <FontAwesomeIcon icon={faWarning} size="xl" className="mt-1 text-primary" />
            <p className="text-xl font-semibold">Upgrade privilege system</p>
          </div>
          <p className="mx-1 mb-4 leading-7 text-mineshaft-100">
            Your existing access control workflows will continue to function. However, actions that
            involve changing privileges or permissions will now use the new permission-based system,
            requiring users to have explicit permission to modify access levels.
          </p>
          <form onSubmit={handleSubmit(handlePrivilegeSystemUpgrade)}>
            <div className="mb-4 rounded-lg border border-red-500 bg-red-500/10 p-4">
              <div className="mb-3 flex items-start gap-2">
                <FontAwesomeIcon
                  icon={faExclamationTriangle}
                  className="mt-1 text-red-500"
                  size="lg"
                />
                <p className="font-bold text-red-400">IMPORTANT: THIS CHANGE IS PERMANENT</p>
              </div>
              <p className="mb-3 ml-7 text-mineshaft-100">
                Once upgraded, your organization <span className="font-bold">cannot</span> revert to
                the legacy privilege system. Please ensure you've completed all preparations before
                proceeding.
              </p>
            </div>

            <div className="mb-4">
              <p className="mb-3 font-medium">Required preparation checklist:</p>

              <div className="flex flex-col space-y-4">
                <Controller
                  control={control}
                  name="isProjectPrivilegesUpdated"
                  defaultValue={false}
                  render={({ field: { onBlur, value, onChange }, fieldState: { error } }) => (
                    <Checkbox
                      containerClassName="items-start"
                      className="mt-0.5 items-start"
                      id="is-project-privileges-updated"
                      indicatorClassName="flex h-full w-full items-center justify-center"
                      allowMultilineLabel
                      isChecked={value}
                      onCheckedChange={onChange}
                      onBlur={onBlur}
                      isError={Boolean(error?.message)}
                    >
                      I have reviewed project-level privileges and updated them if necessary
                    </Checkbox>
                  )}
                />

                <Controller
                  control={control}
                  name="isOrgPrivilegesUpdated"
                  defaultValue={false}
                  render={({ field: { onBlur, value, onChange }, fieldState: { error } }) => (
                    <Checkbox
                      containerClassName="items-start"
                      className="mt-0.5 items-start"
                      indicatorClassName="flex h-full w-full items-center justify-center"
                      allowMultilineLabel
                      id="is-org-privileges-updated"
                      isChecked={value}
                      onCheckedChange={onChange}
                      onBlur={onBlur}
                      isError={Boolean(error?.message)}
                    >
                      I have reviewed organization-level privileges and updated them if necessary
                    </Checkbox>
                  )}
                />

                <Controller
                  control={control}
                  name="isInfrastructureUpdated"
                  defaultValue={false}
                  render={({ field: { onBlur, value, onChange }, fieldState: { error } }) => (
                    <Checkbox
                      containerClassName="items-start"
                      className="mt-0.5 items-start"
                      id="is-infrastructure-updated"
                      indicatorClassName="flex h-full w-full items-center justify-center"
                      allowMultilineLabel
                      isChecked={value}
                      onCheckedChange={onChange}
                      onBlur={onBlur}
                      isError={Boolean(error?.message)}
                    >
                      I have checked Terraform configurations and API integrations for compatibility
                      with the new system
                    </Checkbox>
                  )}
                />

                <Controller
                  control={control}
                  name="acknowledgesPermanentChange"
                  defaultValue={false}
                  rules={{ required: true }}
                  render={({ field: { onBlur, value, onChange }, fieldState: { error } }) => (
                    <Checkbox
                      containerClassName="items-start"
                      className="mt-0.5 items-start"
                      id="acknowledges-permanent-change"
                      indicatorClassName="flex h-full w-full items-center justify-center"
                      allowMultilineLabel
                      isChecked={value}
                      onCheckedChange={onChange}
                      onBlur={onBlur}
                      isError={Boolean(error?.message)}
                    >
                      <span className="font-bold">
                        I understand that this upgrade is permanent and cannot be reversed
                      </span>
                    </Checkbox>
                  )}
                />
              </div>
            </div>
            <Button
              type="submit"
              isDisabled={!isAdmin}
              isLoading={isSubmitting}
              className="mt-5 w-full"
            >
              {isAdmin ? "Upgrade Privilege System" : "Upgrade requires admin privilege"}
            </Button>
          </form>
        </div>
      </ModalContent>
    </Modal>
  );
};
