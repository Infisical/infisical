import { useMemo, useState } from "react";
import { Badge } from "@infisical/cipher/ui/badge";
import { Field } from "@infisical/cipher/ui/field";
import { Input } from "@infisical/cipher/ui/input";
import { Inline, Stack } from "@infisical/cipher/ui/layout";
import { MultiSelect } from "@infisical/cipher/ui/multi-select";
import { PageHeader } from "@infisical/cipher/ui/page-header";
import { Select } from "@infisical/cipher/ui/select";
import { SettingsCard, useAutosave } from "@infisical/cipher/ui/settings-card";
import { Switch } from "@infisical/cipher/ui/switch";

import { MfaEnforcementUpgradeIntent } from "@app/components/license/UpgradeGate/capability-upgrade-intents";
import {
  OrgPermissionActions,
  OrgPermissionSsoActions,
  OrgPermissionSubjects
} from "@app/context/OrgPermissionContext/types";
import { MfaMethod } from "@app/hooks/api/auth/types";
import type { Organization } from "@app/hooks/api/organization/types";
import { useFetchServerStatus } from "@app/hooks/api/serverDetails";

import { useOrgId, useOrgPermission } from "../../access/permissions";
import { failed, saved } from "../../access/toast";
import { AccessRestricted, RESTRICTED } from "../../access/ui";
import { useV4Adapter } from "../../data/adapters";
import { useUpgradeGate } from "../../license";

const MFA_METHODS = [
  { value: MfaMethod.EMAIL, label: "Email" },
  { value: MfaMethod.TOTP, label: "Mobile authenticator" },
  { value: MfaMethod.WEBAUTHN, label: "Passkey (WebAuthn)" }
];

const TIME_UNITS = [
  { value: "m", label: "Minutes" },
  { value: "h", label: "Hours" },
  { value: "d", label: "Days" },
  { value: "w", label: "Weeks" }
];

const parseDuration = (duration?: string) => {
  const match = duration?.match(/^(\d+)([mhdw])$/);
  return match ? { amount: match[1], unit: match[2] } : { amount: "30", unit: "d" };
};

const MfaCard = ({ organization, canEdit }: { organization: Organization; canEdit: boolean }) => {
  const org = useV4Adapter("org");
  const updateOrg = org.useUpdateOrganization();
  const { data: entitlements } = useV4Adapter("orgSettings").useEntitlements(organization.id);
  const { data: serverDetails } = useFetchServerStatus();
  const { openUpgradeGate, upgradeGate } = useUpgradeGate();
  const isEmailAvailable = serverDetails?.emailConfigured ?? true;
  const enforced = organization.enforceMfa;
  const allowed = organization.allowedMfaMethods;
  const methods = useMemo(() => (allowed?.length ? allowed : [MfaMethod.EMAIL]), [allowed]);
  const stored = useMemo(() => ({ enforced, methods }), [enforced, methods]);
  const { value, save, status, pending } = useAutosave({
    value: stored,
    errorMessage: "Couldn't update multi-factor authentication. Try again.",
    onSave: async (next) => {
      await updateOrg.mutateAsync({
        orgId: organization.id,
        enforceMfa: next.enforced,
        allowedMfaMethods: next.methods
      });
      saved(
        next.enforced === stored.enforced
          ? "Allowed MFA methods updated"
          : `MFA ${next.enforced ? "enforced" : "no longer enforced"}`
      );
    }
  });
  const gated = (run: () => void) => {
    if (!entitlements?.enforceMfa) {
      openUpgradeGate({
        paywallKey: "organization.org-generic-auth",
        intent: { ...MfaEnforcementUpgradeIntent, isEnterpriseFeature: false }
      });
      return;
    }
    run();
  };
  const enforce = (checked: boolean) => {
    if (checked && !isEmailAvailable && value.methods.includes(MfaMethod.EMAIL)) {
      failed("Remove Email from the allowed methods first. This instance has no SMTP configured.");
      return;
    }
    save({ ...value, enforced: checked });
  };
  return (
    <SettingsCard
      title={
        <Inline gap={8} wrap={false}>
          Multi-factor authentication
          {value.enforced && <Badge tone="ok">Enforced</Badge>}
        </Inline>
      }
      saveStatus={status}
    >
      <Stack gap={16}>
        <Switch
          layout="row"
          label="Enforce MFA"
          description="Members must complete a second factor to sign in."
          checked={value.enforced}
          disabled={pending}
          disabledReason={canEdit ? undefined : RESTRICTED}
          onCheckedChange={(checked) => gated(() => enforce(checked))}
        />
        {value.enforced && (
          <Field
            label="Allowed methods"
            description={
              isEmailAvailable
                ? "Members sign in with their preferred method from this list."
                : "Email isn't available because this instance has no SMTP configured."
            }
          >
            <MultiSelect
              label="Allowed methods"
              value={value.methods}
              disabled={!canEdit || pending}
              options={MFA_METHODS.map((option) => ({
                ...option,
                disabled: option.value === MfaMethod.EMAIL && !isEmailAvailable
              }))}
              onChange={(next) => {
                if (!next.length) return;
                gated(() => save({ ...value, methods: next as MfaMethod[] }));
              }}
            />
          </Field>
        )}
      </Stack>
      {upgradeGate}
    </SettingsCard>
  );
};

const SessionLengthCard = ({
  organization,
  canEdit
}: {
  organization: Organization;
  canEdit: boolean;
}) => {
  const updateOrg = useV4Adapter("org").useUpdateOrganization();
  const [stored, setStored] = useState(() => parseDuration(organization.userTokenExpiration));
  const [draft, setDraft] = useState(stored);
  const amount = Number(draft.amount);
  const error =
    Number.isInteger(amount) && amount >= 1 ? undefined : "Enter a whole number of at least 1.";
  const dirty = draft.amount !== stored.amount || draft.unit !== stored.unit;
  return (
    <SettingsCard
      title="Session length"
      dirty={dirty}
      locked={canEdit ? undefined : RESTRICTED}
      saveDisabledReason={error}
      onDiscard={() => setDraft(stored)}
      onSave={async () => {
        try {
          await updateOrg.mutateAsync({
            orgId: organization.id,
            userTokenExpiration: `${amount}${draft.unit}`
          });
        } catch (err) {
          failed("Failed to update session length", err);
          return;
        }
        setStored(draft);
        saved("Session length updated");
      }}
    >
      <Inline gap={12} align="start" wrap={false}>
        <Field label="Expires after" error={error}>
          <Input
            type="number"
            min={1}
            step={1}
            width="sm"
            value={draft.amount}
            invalid={Boolean(error)}
            disabled={!canEdit}
            onChange={(event) => setDraft({ ...draft, amount: event.target.value })}
          />
        </Field>
        <Field label="Unit">
          <Select
            label="Unit"
            width="sm"
            value={draft.unit}
            disabled={!canEdit}
            options={TIME_UNITS}
            onChange={(unit) => setDraft({ ...draft, unit })}
          />
        </Field>
      </Inline>
    </SettingsCard>
  );
};

export const SecurityTab = () => {
  const orgId = useOrgId();
  const { permission, isPending } = useOrgPermission();
  const { data: organization } = useV4Adapter("org").useOrganization(orgId);
  const canRead = permission.can(OrgPermissionSsoActions.Read, OrgPermissionSubjects.Sso);
  return (
    <Stack gap={24}>
      <PageHeader title="Security" />
      {!isPending && !canRead && <AccessRestricted requirement="Read SSO" />}
      {canRead && organization && (
        <>
          <MfaCard
            organization={organization}
            canEdit={permission.can(OrgPermissionSsoActions.Edit, OrgPermissionSubjects.Sso)}
          />
          <SessionLengthCard
            key={organization.userTokenExpiration}
            organization={organization}
            canEdit={permission.can(OrgPermissionActions.Edit, OrgPermissionSubjects.Settings)}
          />
        </>
      )}
      {canRead && !organization && <SettingsCard title="Multi-factor authentication" loading />}
    </Stack>
  );
};
