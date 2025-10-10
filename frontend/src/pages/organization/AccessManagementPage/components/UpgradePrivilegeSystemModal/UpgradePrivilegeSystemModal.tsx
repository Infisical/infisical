import { useState } from "react";
import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";

import { createNotification } from "@app/components/notifications";
import { Button, Checkbox, Modal, ModalContent, Tooltip } from "@app/components/v2";
import { useOrgPermission } from "@app/context";
import { OrgMembershipRole } from "@app/helpers/roles";
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
  const { hasOrgRole } = useOrgPermission();
  const [step, setStep] = useState<"info" | "upgrade">("info");

  const {
    handleSubmit,
    control,
    watch,
    formState: { isSubmitting }
  } = useForm({ resolver: zodResolver(formSchema) });
  const { mutateAsync: upgradePrivilegeSystem } = useUpgradePrivilegeSystem();

  const isProjectPrivilegesUpdated = watch("isProjectPrivilegesUpdated");
  const isOrgPrivilegesUpdated = watch("isOrgPrivilegesUpdated");
  const isInfrastructureUpdated = watch("isInfrastructureUpdated");
  const acknowledgesPermanentChange = watch("acknowledgesPermanentChange");
  const isAllChecksCompleted =
    isProjectPrivilegesUpdated &&
    isOrgPrivilegesUpdated &&
    isInfrastructureUpdated &&
    acknowledgesPermanentChange;

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

  const handleClose = () => {
    onOpenChange(false);
    setStep("info");
  };

  const isAdmin = hasOrgRole(OrgMembershipRole.Admin);

  return (
    <Modal isOpen={isOpen} onOpenChange={handleClose}>
      <ModalContent title="Privilege Management System Upgrade" className="max-w-2xl">
        {step === "info" ? (
          <div className="mb-4">
            <p className="text-mineshaft-300 mb-4 text-sm">
              We&apos;ve developed an improved privilege management system that enhances how access
              controls work in your organization.
            </p>

            <div className="border-mineshaft-600 bg-mineshaft-800 mb-4 rounded-lg border p-4">
              <div className="mb-3">
                <div className="mb-3">
                  <p className="text-mineshaft-300 mb-3 text-sm">
                    <strong>Current system: </strong>
                    Users with higher privilege levels can modify access for anyone below them. This
                    rigid hierarchy makes it difficult to implement precise access control policies,
                    forcing you to either over-grant permissions or create complex workarounds when
                    specialized roles (like team leads) need to manage their team&apos;s access
                    without receiving broader administrative powers.
                  </p>
                  <p className="text-mineshaft-300 text-sm">
                    <strong>New system:</strong> Users need explicit permission to modify specific
                    access levels, providing targeted control. After upgrading, you&apos;ll need to
                    grant the new &apos;Grant Privileges&apos; permission. At the organization
                    level, this is available for the{" "}
                    <a
                      href="https://infisical.com/docs/internals/permissions/organization-permissions#subject%3A-groups"
                      target="_blank"
                      rel="noreferrer"
                      className="hover:text-bunker-200 hover:decoration-primary-700 underline"
                    >
                      Group
                    </a>{" "}
                    and{" "}
                    <a
                      href="https://infisical.com/docs/internals/permissions/organization-permissions#subject%3A-identity"
                      target="_blank"
                      rel="noreferrer"
                      className="hover:text-bunker-200 hover:decoration-primary-700 underline"
                    >
                      Identity
                    </a>{" "}
                    subjects while at the project level, this is available for the{" "}
                    <a
                      href="https://infisical.com/docs/internals/permissions/project-permissions#subject%3A-member"
                      target="_blank"
                      rel="noreferrer"
                      className="hover:text-bunker-200 hover:decoration-primary-700 underline"
                    >
                      Member,
                    </a>{" "}
                    <a
                      href="https://infisical.com/docs/internals/permissions/project-permissions#subject%3A-groups"
                      target="_blank"
                      rel="noreferrer"
                      className="hover:text-bunker-200 hover:decoration-primary-700 underline"
                    >
                      Group,
                    </a>{" "}
                    and{" "}
                    <a
                      href="https://infisical.com/docs/internals/permissions/project-permissions#subject%3A-identity"
                      target="_blank"
                      rel="noreferrer"
                      className="hover:text-bunker-200 hover:decoration-primary-700 underline"
                    >
                      Identity
                    </a>{" "}
                    subjects.
                  </p>
                </div>
              </div>
            </div>

            <div className="mt-4 flex justify-end">
              <Button
                onClick={() => setStep("upgrade")}
                variant="solid"
                colorSchema="primary"
                size="md"
                className="bg-primary hover:bg-primary-600 w-[120px]"
              >
                Continue
              </Button>
            </div>
          </div>
        ) : (
          <div className="mb-4">
            <p className="text-mineshaft-300 mb-4 text-sm">
              Your existing access control workflows will continue to function. However, actions
              that involve modifying privileges or permissions will now use the new permission-based
              system, requiring users to have explicit permission to modify given resource.
            </p>

            <p className="text-mineshaft-300 mb-4 text-sm">
              This upgrade affects operations like updating roles, managing group memberships, and
              modifying privileges across your organization and projects.
            </p>

            <div className="border-mineshaft-600 bg-mineshaft-800 mb-4 rounded-lg border p-4">
              <p className="text-mineshaft-300 mb-4 text-sm">
                Once upgraded, your organization <span className="font-bold">cannot</span> revert to
                the legacy privilege system. Please ensure you&apos;ve completed all preparations
                before proceeding.
              </p>

              <div className="mb-4">
                <p className="mb-3 text-sm font-medium">Required preparation checklist:</p>

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
                        id="is-org-privileges-updated"
                        indicatorClassName="flex h-full w-full items-center justify-center"
                        allowMultilineLabel
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
                        I have checked Terraform configurations and API integrations for
                        compatibility with the new system
                      </Checkbox>
                    )}
                  />
                  <Controller
                    control={control}
                    name="acknowledgesPermanentChange"
                    defaultValue={false}
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
                        I understand that this upgrade is permanent and cannot be reversed
                      </Checkbox>
                    )}
                  />
                </div>
              </div>
            </div>
            <form onSubmit={handleSubmit(handlePrivilegeSystemUpgrade)}>
              <div className="mt-6 flex items-center justify-end gap-4">
                <button
                  type="button"
                  onClick={() => setStep("info")}
                  className="text-mineshaft-300 hover:text-mineshaft-200 w-[120px] text-sm"
                >
                  Cancel
                </button>
                <Tooltip
                  content={
                    !isAdmin
                      ? "You cannot perform this upgrade because you are not an organization admin."
                      : undefined
                  }
                >
                  <div>
                    <Button
                      type="submit"
                      variant="solid"
                      colorSchema="primary"
                      size="md"
                      className="bg-primary hover:bg-primary-600 w-[120px]"
                      isDisabled={!isAllChecksCompleted || !isAdmin}
                      isLoading={isSubmitting}
                    >
                      Upgrade
                    </Button>
                  </div>
                </Tooltip>
              </div>
            </form>
          </div>
        )}
      </ModalContent>
    </Modal>
  );
};
