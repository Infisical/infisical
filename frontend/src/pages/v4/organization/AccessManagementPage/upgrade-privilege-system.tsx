import { useState } from "react";
import { Alert } from "@infisical/cipher/ui/alert";
import { Button } from "@infisical/cipher/ui/button";
import { Checkbox } from "@infisical/cipher/ui/checkbox";
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from "@infisical/cipher/ui/dialog";
import { Stack } from "@infisical/cipher/ui/layout";
import { SmallText, Text } from "@infisical/cipher/ui/text";

import { OrgMembershipRole } from "@app/helpers/roles";

import { useOrgPermission } from "../../access/permissions";
import { failed, saved } from "../../access/toast";
import { useV4Adapter } from "../../data/adapters";

const DOCS = "https://infisical.com/docs/internals/permissions";

const CHECKS = [
  "I have reviewed project-level privileges and updated them if necessary",
  "I have reviewed organization-level privileges and updated them if necessary",
  "I have checked Terraform configurations and API integrations for compatibility with the new system",
  "I understand that this upgrade is permanent and cannot be reversed"
];

const DocLink = ({ path, children }: { path: string; children: string }) => (
  <a href={`${DOCS}/${path}`} target="_blank" rel="noreferrer">
    {children}
  </a>
);

const UpgradePrivilegeSystemDialog = ({ onOpenChange }: { onOpenChange: (open: boolean) => void }) => {
  const upgrade = useV4Adapter("access").useUpgradePrivilegeSystem();
  const { hasOrgRole } = useOrgPermission();
  const [step, setStep] = useState<"info" | "upgrade">("info");
  const [checked, setChecked] = useState<boolean[]>(CHECKS.map(() => false));
  const [pending, setPending] = useState(false);
  const isAdmin = hasOrgRole(OrgMembershipRole.Admin);
  const allChecked = checked.every(Boolean);

  const submit = async () => {
    setPending(true);
    try {
      await upgrade.mutateAsync();
      saved("Privilege system upgrade completed");
      onOpenChange(false);
    } catch (error) {
      failed("Failed to upgrade the privilege system", error);
    } finally {
      setPending(false);
    }
  };

  return (
    <Dialog open onOpenChange={onOpenChange}>
      <DialogContent pending={pending}>
        <DialogHeader>
          <DialogTitle>Privilege management system upgrade</DialogTitle>
        </DialogHeader>
        <DialogBody>
          {step === "info" ? (
            <Stack gap={12}>
              <Text>
                <strong>Current system:</strong> users with higher privilege levels can modify access
                for anyone below them, so specialized roles like team leads can&apos;t manage their
                team&apos;s access without broader administrative powers.
              </Text>
              <Text>
                <strong>New system:</strong> users need explicit permission to modify specific access
                levels. After upgrading, grant the new Grant Privileges permission. At the
                organization level it&apos;s on the{" "}
                <DocLink path="organization-permissions#subject%3A-groups">Group</DocLink> and{" "}
                <DocLink path="organization-permissions#subject%3A-identity">Identity</DocLink>{" "}
                subjects, and at the project level on the{" "}
                <DocLink path="project-permissions#subject%3A-member">Member</DocLink>,{" "}
                <DocLink path="project-permissions#subject%3A-groups">Group</DocLink> and{" "}
                <DocLink path="project-permissions#subject%3A-identity">Identity</DocLink> subjects.
              </Text>
            </Stack>
          ) : (
            <Stack gap={16}>
              <Text>
                Existing access control workflows keep working. Updating roles, managing group
                memberships and modifying privileges will require explicit permission on the
                resource.
              </Text>
              <Alert tone="warn" title="This upgrade is permanent">
                Your organization can&apos;t go back to the legacy privilege system. Complete these
                preparations first.
              </Alert>
              <Stack gap={12}>
                {CHECKS.map((label, index) => (
                  <Checkbox
                    key={label}
                    label={label}
                    checked={checked[index]}
                    onChange={(next) =>
                      setChecked((current) =>
                        current.map((value, at) => (at === index ? next : value))
                      )
                    }
                  />
                ))}
              </Stack>
              {!isAdmin && (
                <SmallText muted>Only organization admins can perform this upgrade.</SmallText>
              )}
            </Stack>
          )}
        </DialogBody>
        <DialogFooter>
          {step === "info" ? (
            <>
              <Button variant="ghost" onClick={() => onOpenChange(false)}>
                Cancel
              </Button>
              <Button variant="primary" onClick={() => setStep("upgrade")}>
                Continue
              </Button>
            </>
          ) : (
            <>
              <Button variant="ghost" onClick={() => setStep("info")}>
                Back
              </Button>
              <Button
                variant="primary"
                loading={pending}
                disabledReason={
                  isAdmin
                    ? undefined
                    : "You cannot perform this upgrade because you are not an organization admin."
                }
                disabled={!allChecked}
                onClick={submit}
              >
                Upgrade
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export const LegacyPrivilegeBanner = () => {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Alert
        tone="info"
        title="Your organization is using legacy privilege management"
        actions={
          <Button variant="outline" size="sm" onClick={() => setOpen(true)}>
            Learn more and upgrade
          </Button>
        }
      >
        Upgrade to permission-based privilege management, which lets you choose exactly who can
        change each access level instead of relying on role hierarchy.
      </Alert>
      {open && <UpgradePrivilegeSystemDialog onOpenChange={setOpen} />}
    </>
  );
};
