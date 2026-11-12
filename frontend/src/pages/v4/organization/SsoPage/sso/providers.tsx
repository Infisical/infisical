import { type ReactNode, useState } from "react";
import { Alert, AlertDescription, AlertTitle } from "@infisical/cipher/ui/alert";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle
} from "@infisical/cipher/ui/alert-dialog";
import { Button } from "@infisical/cipher/ui/button";
import { Card } from "@infisical/cipher/ui/card";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from "@infisical/cipher/ui/dialog";
import { DocumentationLinkBadge } from "@infisical/cipher/ui/documentation-link-badge";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger
} from "@infisical/cipher/ui/dropdown-menu";
import {
  Field,
  FieldContent,
  FieldDescription,
  FieldLabel,
  FieldTitle
} from "@infisical/cipher/ui/field";
import { HoverCard, HoverCardContent, HoverCardTrigger } from "@infisical/cipher/ui/hover-card";
import { Icon } from "@infisical/cipher/ui/icon";
import { Inline, Stack } from "@infisical/cipher/ui/layout";
import { RadioGroup, RadioGroupItem } from "@infisical/cipher/ui/radio-group";
import { Switch } from "@infisical/cipher/ui/switch";
import { ArrowLeftRightIcon, PencilIcon } from "lucide-react";

import {
  LdapUpgradeIntent,
  OidcSsoUpgradeIntent,
  SamlSsoUpgradeIntent
} from "@app/components/license/UpgradeGate/capability-upgrade-intents";
import { OrgPermissionActions, OrgPermissionSsoActions, OrgPermissionSubjects } from "@app/context";
import { OauthGrantType } from "@app/hooks/api/oauthClients/types";

import { useOrgId, useOrgPermission } from "../../../access/permissions";
import { failed, saved } from "../../../access/toast";
import { Gate, RESTRICTED } from "../../../access/ui";
import { useV4Adapter } from "../../../data/adapters";
import { useUpgradeGate } from "../../../license";
import { LdapConfigDialog } from "./ldap-dialog";
import { LdapGroupMapsDialog } from "./ldap-group-maps-dialog";
import { OidcConfigDialog } from "./oidc-dialog";
import { SamlConfigDialog } from "./saml-dialog";

export type SsoProvider = "saml" | "oidc" | "ldap";

export const providerLabel = (provider: SsoProvider) => {
  if (provider === "saml") return "SAML";
  if (provider === "oidc") return "OIDC";
  return "LDAP";
};

const GROUP_SYNC_SUPPORTED_PROVIDERS: string[] = ["google-saml"];

const docsLink = "https://infisical.com/docs/documentation/platform/sso/overview";

const SettingRow = ({
  title,
  description,
  label,
  checked,
  disabledReason,
  onChange
}: {
  title: ReactNode;
  description: string;
  label: string;
  checked: boolean;
  disabledReason?: string;
  onChange: (checked: boolean) => Promise<void>;
}) => {
  const [pending, setPending] = useState(false);
  return (
    <Field orientation="horizontal">
      <FieldContent>
        <FieldTitle>{title}</FieldTitle>
        <FieldDescription>{description}</FieldDescription>
      </FieldContent>
      <Gate allowed={!disabledReason} reason={disabledReason}>
        <Switch
          aria-label={label}
          checked={checked}
          disabled={Boolean(disabledReason) || pending}
          onChange={async (next) => {
            setPending(true);
            try {
              await onChange(next);
            } finally {
              setPending(false);
            }
          }}
        />
      </Gate>
    </Field>
  );
};

const InfoHoverCard = ({ label, children }: { label: string; children: ReactNode }) => (
  <HoverCard openDelay={150} closeDelay={150}>
    <HoverCardTrigger asChild>
      <Button type="button" variant="ghost" size="icon-xs" icon="info" iconOnly>
        {label}
      </Button>
    </HoverCardTrigger>
    <HoverCardContent className="w-96">
      <Stack gap={12}>{children}</Stack>
    </HoverCardContent>
  </HoverCard>
);

const DocsLink = ({ children }: { children: ReactNode }) => (
  <a
    target="_blank"
    rel="noopener noreferrer"
    className="text-foreground no-underline hover:underline"
    href={docsLink}
  >
    {children}
  </a>
);

const ProviderMenu = ({
  provider,
  canEdit,
  onEdit,
  onSwitchProvider
}: {
  provider: SsoProvider;
  canEdit: boolean;
  onEdit: () => void;
  onSwitchProvider?: () => void;
}) => (
  <DropdownMenu>
    <DropdownMenuTrigger asChild>
      <Button variant="ghost" size="icon-sm" icon="more" iconOnly>
        {`${providerLabel(provider)} configuration options`}
      </Button>
    </DropdownMenuTrigger>
    <DropdownMenuContent align="end">
      <DropdownMenuItem
        disabled={!canEdit}
        description={canEdit ? undefined : RESTRICTED}
        onSelect={onEdit}
      >
        <Icon icon={PencilIcon} />
        Edit configuration
      </DropdownMenuItem>
      {onSwitchProvider && (
        <DropdownMenuItem onSelect={onSwitchProvider}>
          <Icon icon={ArrowLeftRightIcon} />
          Switch method
        </DropdownMenuItem>
      )}
    </DropdownMenuContent>
  </DropdownMenu>
);

const googleEnforcedReason = (provider: string) =>
  `You cannot enable ${provider} SSO while Google OAuth is enforced. Disable Google OAuth enforcement to enable ${provider} SSO.`;

const toggleReason = (canEdit: boolean, isGoogleOAuthEnabled: boolean, provider: string) => {
  if (!canEdit) return RESTRICTED;
  if (isGoogleOAuthEnabled) return googleEnforcedReason(provider);
  return undefined;
};

type SectionProps = { onSwitchProvider?: () => void };

export const SamlSection = ({ onSwitchProvider }: SectionProps) => {
  const orgId = useOrgId();
  const sso = useV4Adapter("sso");
  const { data, isPending } = sso.useSamlConfig(orgId);
  const { data: subscription } = sso.useSubscription(orgId);
  const { data: organization } = useV4Adapter("org").useOrganization(orgId);
  const updateConfig = sso.useUpdateSamlConfig();
  const createConfig = sso.useCreateSamlConfig();
  const { permission } = useOrgPermission();
  const { openUpgradeGate, upgradeGate } = useUpgradeGate();
  const [isConfigOpen, setIsConfigOpen] = useState(false);

  const canCreate = permission.can(OrgPermissionSsoActions.Create, OrgPermissionSubjects.Sso);
  const canEdit = permission.can(OrgPermissionSsoActions.Edit, OrgPermissionSubjects.Sso);
  const isGoogleOAuthEnabled = Boolean(organization?.googleSsoAuthEnforced);

  const openUpgrade = (isEnterpriseFeature: boolean) =>
    openUpgradeGate({
      intent: { ...SamlSsoUpgradeIntent, isEnterpriseFeature },
      paywallKey: "organization.org-sso.section"
    });

  const handleSamlSSOToggle = async (value: boolean) => {
    if (!subscription?.samlSSO) {
      openUpgrade(false);
      return;
    }
    try {
      await updateConfig.mutateAsync({ organizationId: orgId, isActive: value });
      saved(`SAML SSO ${value ? "enabled" : "disabled"}`);
    } catch (error) {
      failed(`Failed to ${value ? "enable" : "disable"} SAML SSO`, error);
    }
  };

  const handleSamlGroupManagement = async (value: boolean) => {
    if (!subscription?.samlSSO || !subscription?.groups) {
      openUpgrade(true);
      return;
    }
    try {
      await updateConfig.mutateAsync({ organizationId: orgId, enableGroupSync: value });
      saved(`SAML group membership mapping ${value ? "enabled" : "disabled"}`);
    } catch (error) {
      failed(`Failed to ${value ? "enable" : "disable"} SAML group membership mapping`, error);
    }
  };

  const addSSOBtnClick = async () => {
    if (!subscription?.samlSSO) {
      openUpgrade(false);
      return;
    }
    try {
      if (!data) {
        await createConfig.mutateAsync({
          organizationId: orgId,
          authProvider: "okta-saml",
          isActive: false,
          entryPoint: "",
          issuer: "",
          cert: ""
        });
      }
      setIsConfigOpen(true);
    } catch (error) {
      failed("Failed to start the SAML configuration", error);
    }
  };

  return (
    <>
      <Card
        variant="framed"
        title="SAML"
        action={
          !isPending && (
            <ProviderMenu
              provider="saml"
              canEdit={canCreate}
              onEdit={addSSOBtnClick}
              onSwitchProvider={onSwitchProvider}
            />
          )
        }
      >
        <Stack gap={16}>
          <SettingRow
            title="Enable SAML"
            label="Enable SAML"
            description="Allow members to authenticate into Infisical with SAML."
            checked={data ? data.isActive : false}
            disabledReason={toggleReason(canEdit, isGoogleOAuthEnabled, "SAML")}
            onChange={handleSamlSSOToggle}
          />
          {data && GROUP_SYNC_SUPPORTED_PROVIDERS.includes(data.authProvider) && (
            <SettingRow
              title={
                <Inline gap={4} wrap={false}>
                  SAML group membership mapping
                  <InfoHoverCard label="About SAML group membership mapping">
                    <p>
                      When this feature is enabled, Infisical will automatically sync group
                      memberships between the SAML provider and Infisical. Users will be added to
                      Infisical groups that match their SAML group names.
                    </p>
                    <p>
                      To use this feature you must include group claims in the SAML response as a
                      &quot;groups&quot; attribute.{" "}
                      <DocsLink>See your SAML provider docs for details.</DocsLink>
                    </p>
                    <Alert tone="warn">
                      <AlertDescription>
                        Group membership changes in the SAML provider only sync with Infisical when
                        a user logs in via SAML. Removing a user from a group in the SAML provider
                        will not be reflected in Infisical until their next SAML login. Enable
                        Enforce SAML SSO to ensure this behavior.
                      </AlertDescription>
                    </Alert>
                  </InfoHoverCard>
                </Inline>
              }
              label="SAML group membership mapping"
              description="Infisical will manage user group memberships based on the SAML provider."
              checked={data.enableGroupSync ?? false}
              disabledReason={canEdit ? undefined : RESTRICTED}
              onChange={handleSamlGroupManagement}
            />
          )}
        </Stack>
      </Card>
      <SamlConfigDialog open={isConfigOpen} onOpenChange={setIsConfigOpen} />
      {upgradeGate}
    </>
  );
};

const TokenExchangeDependentsAlert = () => {
  const orgId = useOrgId();
  const { data: oauthClients } = useV4Adapter("sso").useOauthClients(orgId);

  const hasTokenExchangeClient = (oauthClients ?? []).some((client) =>
    client.grantTypes.includes(OauthGrantType.TokenExchange)
  );

  if (!hasTokenExchangeClient) return null;

  return (
    <Alert tone="info">
      <AlertDescription>
        OAuth application depends on this configuration. Disabling OIDC will stop the application
        from exchanging tokens.
      </AlertDescription>
    </Alert>
  );
};

export const OidcSection = ({ onSwitchProvider }: SectionProps) => {
  const orgId = useOrgId();
  const sso = useV4Adapter("sso");
  const { data, isPending } = sso.useOidcConfig(orgId);
  const { data: subscription } = sso.useSubscription(orgId);
  const { data: organization } = useV4Adapter("org").useOrganization(orgId);
  const updateConfig = sso.useUpdateOidcConfig();
  const { permission } = useOrgPermission();
  const { openUpgradeGate, upgradeGate } = useUpgradeGate();
  const [isConfigOpen, setIsConfigOpen] = useState(false);

  const canCreate = permission.can(OrgPermissionSsoActions.Create, OrgPermissionSubjects.Sso);
  const canEdit = permission.can(OrgPermissionSsoActions.Edit, OrgPermissionSubjects.Sso);
  const canReadOauthClients = permission.can(
    OrgPermissionActions.Read,
    OrgPermissionSubjects.OauthClients
  );
  const isGoogleOAuthEnabled = Boolean(organization?.googleSsoAuthEnforced);

  const openUpgrade = () =>
    openUpgradeGate({
      intent: { ...OidcSsoUpgradeIntent, isEnterpriseFeature: true },
      paywallKey: "organization.org-oidc.section"
    });

  const handleOIDCToggle = async (value: boolean) => {
    if (!subscription?.oidcSSO) {
      openUpgrade();
      return;
    }
    try {
      await updateConfig.mutateAsync({ organizationId: orgId, isActive: value });
      saved(`OIDC SSO ${value ? "enabled" : "disabled"}`);
    } catch (error) {
      failed(`Failed to ${value ? "enable" : "disable"} OIDC SSO`, error);
    }
  };

  const handleOIDCGroupManagement = async (value: boolean) => {
    if (!subscription?.oidcSSO) {
      openUpgrade();
      return;
    }
    try {
      await updateConfig.mutateAsync({ organizationId: orgId, manageGroupMemberships: value });
      saved(`OIDC group membership mapping ${value ? "enabled" : "disabled"}`);
    } catch (error) {
      failed(`Failed to ${value ? "enable" : "disable"} OIDC group membership mapping`, error);
    }
  };

  const addOidcButtonClick = () => {
    if (subscription?.oidcSSO) {
      setIsConfigOpen(true);
    } else {
      openUpgrade();
    }
  };

  return (
    <>
      <Card
        variant="framed"
        title="OIDC"
        action={
          !isPending && (
            <ProviderMenu
              provider="oidc"
              canEdit={canCreate}
              onEdit={addOidcButtonClick}
              onSwitchProvider={onSwitchProvider}
            />
          )
        }
      >
        <Stack gap={16}>
          {canReadOauthClients && <TokenExchangeDependentsAlert />}
          {data && (
            <SettingRow
              title="Enable OIDC"
              label="Enable OIDC"
              description="Allow members to authenticate into Infisical with OIDC."
              checked={data.isActive}
              disabledReason={toggleReason(canEdit, isGoogleOAuthEnabled, "OIDC")}
              onChange={handleOIDCToggle}
            />
          )}
          <SettingRow
            title={
              <Inline gap={4} wrap={false}>
                OIDC group membership mapping
                <InfoHoverCard label="About OIDC group membership mapping">
                  <p>
                    Sync group memberships from your OIDC provider on each sign-in. Users join
                    groups matching their OIDC group names and leave the ones that don&apos;t.
                    Manual group management is disabled while this is on.
                  </p>
                  <p>
                    Requires group claims in the OIDC token.{" "}
                    <DocsLink>See your OIDC provider docs for details.</DocsLink>
                  </p>
                  <Alert tone="warn">
                    <AlertTitle>
                      Changes only apply on the user&apos;s next OIDC sign-in.
                    </AlertTitle>
                    <AlertDescription>Enforce OIDC SSO to keep this gap small.</AlertDescription>
                  </Alert>
                </InfoHoverCard>
              </Inline>
            }
            label="OIDC group membership mapping"
            description="Infisical will manage user group memberships based on the OIDC provider."
            checked={data?.manageGroupMemberships ?? false}
            disabledReason={canEdit ? undefined : RESTRICTED}
            onChange={handleOIDCGroupManagement}
          />
        </Stack>
      </Card>
      <OidcConfigDialog open={isConfigOpen} onOpenChange={setIsConfigOpen} />
      {upgradeGate}
    </>
  );
};

export const LdapSection = ({ onSwitchProvider }: SectionProps) => {
  const orgId = useOrgId();
  const sso = useV4Adapter("sso");
  const { data } = sso.useLdapConfig(orgId);
  const { data: subscription } = sso.useSubscription(orgId);
  const { data: organization } = useV4Adapter("org").useOrganization(orgId);
  const updateConfig = sso.useUpdateLdapConfig();
  const createConfig = sso.useCreateLdapConfig();
  const { permission } = useOrgPermission();
  const { openUpgradeGate, upgradeGate } = useUpgradeGate();
  const [isConfigOpen, setIsConfigOpen] = useState(false);
  const [isGroupMapOpen, setIsGroupMapOpen] = useState(false);

  const canCreate = permission.can(OrgPermissionActions.Create, OrgPermissionSubjects.Ldap);
  const canEdit = permission.can(OrgPermissionActions.Edit, OrgPermissionSubjects.Ldap);
  const isGoogleOAuthEnabled = Boolean(organization?.googleSsoAuthEnforced);

  const openUpgrade = () =>
    openUpgradeGate({
      intent: { ...LdapUpgradeIntent, isEnterpriseFeature: true },
      paywallKey: "organization.org-ldap.section"
    });

  const handleLDAPToggle = async (value: boolean) => {
    if (!subscription?.ldap) {
      openUpgrade();
      return;
    }
    try {
      await updateConfig.mutateAsync({ organizationId: orgId, isActive: value });
      saved(`LDAP ${value ? "enabled" : "disabled"}`);
    } catch (error) {
      failed(`Failed to ${value ? "enable" : "disable"} LDAP`, error);
    }
  };

  const addLDAPBtnClick = async () => {
    if (!subscription?.ldap) {
      openUpgrade();
      return;
    }
    try {
      if (!data) {
        await createConfig.mutateAsync({
          organizationId: orgId,
          isActive: false,
          url: "",
          bindDN: "",
          bindPass: "",
          uniqueUserAttribute: "",
          searchBase: "",
          searchFilter: "",
          groupSearchBase: "",
          groupSearchFilter: ""
        });
      }
      setIsConfigOpen(true);
    } catch (error) {
      failed("Failed to start the LDAP configuration", error);
    }
  };

  const openLDAPGroupMapModal = () => {
    if (!subscription?.ldap) {
      openUpgrade();
      return;
    }
    setIsGroupMapOpen(true);
  };

  return (
    <>
      <Card
        variant="framed"
        title="LDAP"
        action={
          <ProviderMenu
            provider="ldap"
            canEdit={canCreate}
            onEdit={addLDAPBtnClick}
            onSwitchProvider={onSwitchProvider}
          />
        }
      >
        <Stack gap={16}>
          {data && (
            <SettingRow
              title="Enable LDAP"
              label="Enable LDAP"
              description="Allow members to authenticate into Infisical with LDAP."
              checked={data.isActive}
              disabledReason={toggleReason(canEdit, isGoogleOAuthEnabled, "LDAP")}
              onChange={handleLDAPToggle}
            />
          )}
          <Field orientation="horizontal">
            <FieldContent>
              <FieldTitle>LDAP group mappings</FieldTitle>
              <FieldDescription>
                Manage how LDAP groups are mapped to internal groups in Infisical.
              </FieldDescription>
            </FieldContent>
            <Button
              variant="outline"
              disabledReason={canCreate ? undefined : RESTRICTED}
              onClick={openLDAPGroupMapModal}
            >
              Configure
            </Button>
          </Field>
        </Stack>
      </Card>
      <LdapConfigDialog open={isConfigOpen} onOpenChange={setIsConfigOpen} />
      <LdapGroupMapsDialog open={isGroupMapOpen} onOpenChange={setIsGroupMapOpen} />
      {upgradeGate}
    </>
  );
};

const providerOptions: { value: SsoProvider; description: string }[] = [
  {
    value: "saml",
    description: "Standard enterprise SSO, such as Okta, Azure, or Google Workspace."
  },
  {
    value: "oidc",
    description: "OAuth-based identity layer, such as Auth0, Keycloak, or custom IdPs."
  },
  { value: "ldap", description: "Directory protocol for on-prem identity stores." }
];

export const ProviderChooserDialog = ({
  open,
  onOpenChange,
  exclude,
  isAvailable,
  pending,
  onContinue
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  exclude: SsoProvider | null;
  isAvailable: (provider: SsoProvider) => boolean;
  pending: boolean;
  onContinue: (provider: SsoProvider) => void;
}) => {
  const [selected, setSelected] = useState<SsoProvider | "">("");
  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        onOpenChange(next);
        if (!next) setSelected("");
      }}
    >
      <DialogContent pending={pending}>
        <DialogHeader>
          <DialogTitle>
            <Inline gap={8} wrap={false}>
              {exclude ? "Switch identity provider" : "Add identity provider"}
              <DocumentationLinkBadge href="https://infisical.com/docs/integrations/user-authentication" />
            </Inline>
          </DialogTitle>
        </DialogHeader>
        <RadioGroup
          aria-label="Identity provider protocol"
          value={selected}
          onValueChange={(value) => setSelected(value as SsoProvider)}
        >
          {providerOptions
            .filter(({ value }) => isAvailable(value) && exclude !== value)
            .map(({ value, description }) => (
              <Field key={value} orientation="horizontal">
                <RadioGroupItem value={value} id={`provider-${value}`} />
                <FieldContent>
                  <FieldLabel htmlFor={`provider-${value}`}>{providerLabel(value)}</FieldLabel>
                  <FieldDescription>{description}</FieldDescription>
                </FieldContent>
              </Field>
            ))}
        </RadioGroup>
        <DialogFooter>
          <DialogClose asChild>
            <Button variant="outline">Cancel</Button>
          </DialogClose>
          <Button
            loading={pending}
            disabledReason={selected ? undefined : "Choose a protocol first"}
            onClick={() => {
              if (!selected) return;
              onContinue(selected);
              setSelected("");
            }}
          >
            Continue
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export const SwitchProviderDialog = ({
  pendingSwitch,
  onOpenChange,
  onConfirm
}: {
  pendingSwitch: { from: SsoProvider; to: SsoProvider } | null;
  onOpenChange: (open: boolean) => void;
  onConfirm: () => Promise<void>;
}) => {
  const [pending, setPending] = useState(false);
  return (
    <AlertDialog open={pendingSwitch !== null} onOpenChange={onOpenChange}>
      <AlertDialogContent icon="sync" pending={pending}>
        <AlertDialogHeader>
          <AlertDialogTitle>
            {pendingSwitch
              ? `Switch to ${providerLabel(pendingSwitch.to)}?`
              : "Switch identity provider?"}
          </AlertDialogTitle>
          <AlertDialogDescription>
            {pendingSwitch
              ? `This will clear your current ${providerLabel(pendingSwitch.from)} configuration. Members will no longer be able to sign in via ${providerLabel(pendingSwitch.from)} or SSO until ${providerLabel(pendingSwitch.to)} is configured and activated.`
              : null}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <Button
            variant="destructive"
            loading={pending}
            onClick={async () => {
              setPending(true);
              try {
                await onConfirm();
              } finally {
                setPending(false);
              }
            }}
          >
            Switch
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
};
