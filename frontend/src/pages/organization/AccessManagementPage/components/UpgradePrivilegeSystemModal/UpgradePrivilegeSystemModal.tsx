import { useState } from "react";
import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";

import { createNotification } from "@app/components/notifications";
import {
  Button,
  Checkbox,
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Field,
  FieldContent,
  FieldGroup,
  FieldLabel,
  Tooltip,
  TooltipContent,
  TooltipTrigger
} from "@app/components/v3";
import { useOrgPermission } from "@app/context";
import { OrgMembershipRole } from "@app/helpers/roles";
import { useScopeVariant } from "@app/hooks";
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
  const scopeVariant = useScopeVariant();

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
    await upgradePrivilegeSystem();

    createNotification({
      text: "Privilege system upgrade completed",
      type: "success"
    });

    onOpenChange(false);
  };

  const handleClose = () => {
    onOpenChange(false);
    setStep("info");
  };

  const isAdmin = hasOrgRole(OrgMembershipRole.Admin);

  return (
    <Dialog open={isOpen} onOpenChange={handleClose}>
      <DialogContent isPending={isSubmitting}>
        <DialogHeader>
          <DialogTitle>Privilege Management System Upgrade</DialogTitle>
        </DialogHeader>
        {step === "info" ? (
          <div>
            <p className="mb-4 text-sm text-label">
              We&apos;ve developed an improved privilege management system that enhances how access
              controls work in your organization.
            </p>

            <div className="mb-4 rounded-lg border border-border-control bg-surface-raised p-4">
              <div className="mb-3">
                <div className="mb-3">
                  <p className="mb-3 text-sm text-label">
                    <strong>Current system: </strong>
                    Users with higher privilege levels can modify access for anyone below them. This
                    rigid hierarchy makes it difficult to implement precise access control policies,
                    forcing you to either over-grant permissions or create complex workarounds when
                    specialized roles (like team leads) need to manage their team&apos;s access
                    without receiving broader administrative powers.
                  </p>
                  <p className="text-sm text-label">
                    <strong>New system:</strong> Users need explicit permission to modify specific
                    access levels, providing targeted control. After upgrading, you&apos;ll need to
                    grant the new &apos;Grant Privileges&apos; permission. At the organization
                    level, this is available for the{" "}
                    <a
                      href="https://infisical.com/docs/internals/permissions/organization-permissions#subject%3A-groups"
                      target="_blank"
                      rel="noreferrer"
                      className="underline hover:text-foreground-soft hover:decoration-project"
                    >
                      Group
                    </a>{" "}
                    and{" "}
                    <a
                      href="https://infisical.com/docs/internals/permissions/organization-permissions#subject%3A-identity"
                      target="_blank"
                      rel="noreferrer"
                      className="underline hover:text-foreground-soft hover:decoration-project"
                    >
                      Identity
                    </a>{" "}
                    subjects while at the project level, this is available for the{" "}
                    <a
                      href="https://infisical.com/docs/internals/permissions/project-permissions#subject%3A-member"
                      target="_blank"
                      rel="noreferrer"
                      className="underline hover:text-foreground-soft hover:decoration-project"
                    >
                      Member,
                    </a>{" "}
                    <a
                      href="https://infisical.com/docs/internals/permissions/project-permissions#subject%3A-groups"
                      target="_blank"
                      rel="noreferrer"
                      className="underline hover:text-foreground-soft hover:decoration-project"
                    >
                      Group,
                    </a>{" "}
                    and{" "}
                    <a
                      href="https://infisical.com/docs/internals/permissions/project-permissions#subject%3A-identity"
                      target="_blank"
                      rel="noreferrer"
                      className="underline hover:text-foreground-soft hover:decoration-project"
                    >
                      Identity
                    </a>{" "}
                    subjects.
                  </p>
                </div>
              </div>
            </div>

            <DialogFooter>
              <Button onClick={() => setStep("upgrade")} variant={scopeVariant}>
                Continue
              </Button>
            </DialogFooter>
          </div>
        ) : (
          <form onSubmit={handleSubmit(handlePrivilegeSystemUpgrade)}>
            <p className="mb-4 text-sm text-label">
              Your existing access control workflows will continue to function. However, actions
              that involve modifying privileges or permissions will now use the new permission-based
              system, requiring users to have explicit permission to modify given resource.
            </p>

            <p className="mb-4 text-sm text-label">
              This upgrade affects operations like updating roles, managing group memberships, and
              modifying privileges across your organization and projects.
            </p>

            <div className="mb-4 rounded-lg border border-border-control bg-surface-raised p-4">
              <p className="mb-4 text-sm text-label">
                Once upgraded, your organization <span className="font-bold">cannot</span> revert to
                the legacy privilege system. Please ensure you&apos;ve completed all preparations
                before proceeding.
              </p>

              <div className="mb-4">
                <p className="mb-3 text-sm font-medium">Required preparation checklist:</p>

                <FieldGroup>
                  <Controller
                    control={control}
                    name="isProjectPrivilegesUpdated"
                    defaultValue={false}
                    render={({ field: { onBlur, value, onChange }, fieldState: { error } }) => (
                      <Field orientation="horizontal" data-invalid={Boolean(error)}>
                        <Checkbox
                          id="is-project-privileges-updated"
                          variant={scopeVariant}
                          isChecked={value}
                          onCheckedChange={(checked) => onChange(checked === true)}
                          onBlur={onBlur}
                          isError={Boolean(error)}
                        />
                        <FieldContent>
                          <FieldLabel
                            htmlFor="is-project-privileges-updated"
                            className="cursor-pointer"
                            size="sm"
                          >
                            I have reviewed project-level privileges and updated them if necessary
                          </FieldLabel>
                        </FieldContent>
                      </Field>
                    )}
                  />
                  <Controller
                    control={control}
                    name="isOrgPrivilegesUpdated"
                    defaultValue={false}
                    render={({ field: { onBlur, value, onChange }, fieldState: { error } }) => (
                      <Field orientation="horizontal" data-invalid={Boolean(error)}>
                        <Checkbox
                          id="is-org-privileges-updated"
                          variant={scopeVariant}
                          isChecked={value}
                          onCheckedChange={(checked) => onChange(checked === true)}
                          onBlur={onBlur}
                          isError={Boolean(error)}
                        />
                        <FieldContent>
                          <FieldLabel
                            htmlFor="is-org-privileges-updated"
                            className="cursor-pointer"
                            size="sm"
                          >
                            I have reviewed organization-level privileges and updated them if
                            necessary
                          </FieldLabel>
                        </FieldContent>
                      </Field>
                    )}
                  />
                  <Controller
                    control={control}
                    name="isInfrastructureUpdated"
                    defaultValue={false}
                    render={({ field: { onBlur, value, onChange }, fieldState: { error } }) => (
                      <Field orientation="horizontal" data-invalid={Boolean(error)}>
                        <Checkbox
                          id="is-infrastructure-updated"
                          variant={scopeVariant}
                          isChecked={value}
                          onCheckedChange={(checked) => onChange(checked === true)}
                          onBlur={onBlur}
                          isError={Boolean(error)}
                        />
                        <FieldContent>
                          <FieldLabel
                            htmlFor="is-infrastructure-updated"
                            className="cursor-pointer"
                            size="sm"
                          >
                            I have checked Terraform configurations and API integrations for
                            compatibility with the new system
                          </FieldLabel>
                        </FieldContent>
                      </Field>
                    )}
                  />
                  <Controller
                    control={control}
                    name="acknowledgesPermanentChange"
                    defaultValue={false}
                    render={({ field: { onBlur, value, onChange }, fieldState: { error } }) => (
                      <Field orientation="horizontal" data-invalid={Boolean(error)}>
                        <Checkbox
                          id="acknowledges-permanent-change"
                          variant={scopeVariant}
                          isChecked={value}
                          onCheckedChange={(checked) => onChange(checked === true)}
                          onBlur={onBlur}
                          isError={Boolean(error)}
                        />
                        <FieldContent>
                          <FieldLabel
                            htmlFor="acknowledges-permanent-change"
                            className="cursor-pointer"
                            size="sm"
                          >
                            I understand that this upgrade is permanent and cannot be reversed
                          </FieldLabel>
                        </FieldContent>
                      </Field>
                    )}
                  />
                </FieldGroup>
              </div>
            </div>
            <DialogFooter>
              <Button variant="ghost" isDisabled={isSubmitting} onClick={() => setStep("info")}>
                Cancel
              </Button>
              {isAdmin ? (
                <Button
                  type="submit"
                  variant={scopeVariant}
                  isDisabled={!isAllChecksCompleted}
                  isPending={isSubmitting}
                >
                  Upgrade
                </Button>
              ) : (
                <Tooltip hoverable delayDuration={50}>
                  <TooltipTrigger asChild>
                    <div>
                      <Button type="submit" variant={scopeVariant} isDisabled>
                        Upgrade
                      </Button>
                    </div>
                  </TooltipTrigger>
                  <TooltipContent>
                    You cannot perform this upgrade because you are not an organization admin.
                  </TooltipContent>
                </Tooltip>
              )}
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
};
