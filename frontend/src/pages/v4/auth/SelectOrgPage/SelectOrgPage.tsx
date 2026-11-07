import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useRouteContext, useRouter, useSearch } from "@tanstack/react-router";
import { addSeconds, format, formatISO } from "date-fns";

import SecurityClient from "@app/components/utilities/SecurityClient";
import { Button } from "@app/components/v4/ui/button";
import { Input } from "@app/components/v4/ui/input";
import { Stack } from "@app/components/v4/ui/layout";
import { List, ListRow } from "@app/components/v4/ui/list";
import { Loader } from "@app/components/v4/ui/loader";
import { toast } from "@app/components/v4/ui/sonner";
import { SessionStorageKeys } from "@app/const";
import {
  TOrgWithSubOrgs,
  useGetOrganizationsWithSubOrgs,
  useGetUser,
  useLogoutUser,
  useSelectOrganization
} from "@app/hooks/api";
import { MfaMethod, UserAgentType } from "@app/hooks/api/auth/types";
import { setAuthToken } from "@app/hooks/api/reactQuery";
import { getSsoEnforcementError } from "@app/pages/auth/SelectOrgPage/SelectOrg.utils";

import { AuthPage } from "../components/AuthPage";
import { Mfa } from "../components/Mfa";
import { toV4Href } from "../paths";
import { useAuthPreview } from "../preview";
import { PREVIEW_ORGS } from "./preview";

import styles from "../auth.module.css";

const ROUTE_ID = "/v4/_v4-auth/login/select-organization";

type ViewProps = {
  username: string;
  orgs: TOrgWithSubOrgs[];
  isLoading: boolean;
  initialRootOrgId?: string;
  onSelect: (org: TOrgWithSubOrgs, subOrgId?: string) => void;
  onSignOut: () => void;
};

type OrgRow = {
  org: TOrgWithSubOrgs;
  id: string;
  name: string;
  joinedAt?: string | null;
  subOrgId?: string;
  parentName?: string;
  isRoot?: boolean;
};

const memberSince = (joinedAt?: string | null) =>
  joinedAt ? `Member since ${format(new Date(joinedAt), "MMM d, yyyy")}` : undefined;

const matches = (name: string, term: string) => name.toLowerCase().includes(term);

const SelectOrgView = ({
  username,
  orgs,
  isLoading,
  initialRootOrgId,
  onSelect,
  onSignOut
}: ViewProps) => {
  const [searchTerm, setSearchTerm] = useState("");
  const [rootOrgId, setRootOrgId] = useState(initialRootOrgId);
  const rootOrg = orgs.find((org) => org.id === rootOrgId);
  const term = searchTerm.trim().toLowerCase();

  const rows = useMemo((): OrgRow[] => {
    if (rootOrg) {
      return [
        {
          org: rootOrg,
          id: rootOrg.id,
          name: rootOrg.name,
          joinedAt: rootOrg.userJoinedAt,
          isRoot: true
        },
        ...rootOrg.subOrganizations
          .filter((sub) => !term || matches(sub.name, term))
          .map((sub) => ({
            org: rootOrg,
            id: sub.id,
            name: sub.name,
            joinedAt: sub.userJoinedAt,
            subOrgId: sub.id
          }))
      ];
    }
    return orgs.flatMap((org) => {
      const isOrgMatch = !term || matches(org.name, term);
      const subOrgs = term
        ? org.subOrganizations.filter((sub) => isOrgMatch || matches(sub.name, term))
        : [];
      if (!isOrgMatch && subOrgs.length === 0) return [];
      return [
        { org, id: org.id, name: org.name, joinedAt: org.userJoinedAt },
        ...subOrgs.map((sub) => ({
          org,
          id: sub.id,
          name: sub.name,
          joinedAt: sub.userJoinedAt,
          subOrgId: sub.id,
          parentName: org.name
        }))
      ];
    });
  }, [orgs, rootOrg, term]);

  return (
    <AuthPage
      pageTitle="Select Organization"
      title="Choose an organization"
      description={
        <>
          Signed in as <span className={styles.recipient}>{username}</span>
        </>
      }
      titleAction={
        <Button type="button" variant="link" onClick={onSignOut}>
          Sign out
        </Button>
      }
      variant="focused"
      wide
    >
      <Stack gap={12}>
        <Input
          icon="search"
          value={searchTerm}
          onChange={(event) => setSearchTerm(event.target.value)}
          placeholder={rootOrg ? "Search sub-organizations" : "Search organizations"}
          aria-label={rootOrg ? "Search sub-organizations" : "Search organizations"}
        />
        {rootOrg && (
          <div>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              icon="chev-left"
              onClick={() => {
                setRootOrgId(undefined);
                setSearchTerm("");
              }}
            >
              All organizations
            </Button>
          </div>
        )}
        <List
          label={rootOrg ? `${rootOrg.name} sub-organizations` : "Your organizations"}
          loading={isLoading}
          empty={rootOrg ? "No sub-organizations found" : "No organizations found"}
        >
          {rows.map((row) => {
            let description = memberSince(row.joinedAt);
            if (row.isRoot)
              description = ["Root organization", description].filter(Boolean).join(", ");
            if (row.parentName) description = `Sub-organization of ${row.parentName}`;
            const subOrgCount =
              row.subOrgId || rootOrg || term ? 0 : row.org.subOrganizations.length;
            return (
              <ListRow
                key={row.id}
                value={row.id}
                label={`Log in to ${row.name}`}
                title={row.name}
                description={description}
                onClick={() => onSelect(row.org, row.subOrgId)}
                actions={
                  subOrgCount > 0 ? (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      aria-label={`View sub-organizations of ${row.name}`}
                      onClick={() => {
                        setRootOrgId(row.org.id);
                        setSearchTerm("");
                      }}
                    >
                      {subOrgCount} sub-{subOrgCount === 1 ? "organization" : "organizations"}
                    </Button>
                  ) : undefined
                }
              />
            );
          })}
        </List>
      </Stack>
    </AuthPage>
  );
};

const LiveSelectOrg = () => {
  const navigate = useNavigate();
  const router = useRouter();
  const search = useSearch({ from: ROUTE_ID });
  const { autoSelectErrorMessage } = useRouteContext({ from: ROUTE_ID });
  const {
    org_id: orgId,
    callback_port: callbackPort,
    is_admin_login: isBreakglassRoute,
    mfa_method: mfaMethodFromSearch,
    redirect_to: redirectTo
  } = search;
  const [shouldShowMfa, setShouldShowMfa] = useState(false);
  const [requiredMfaMethod, setRequiredMfaMethod] = useState(
    (mfaMethodFromSearch as MfaMethod | undefined) ?? MfaMethod.EMAIL
  );
  const mfaOrgInfo = useRef<{ rootOrg: TOrgWithSubOrgs; subOrgId?: string } | null>(null);

  const { data: orgs, isPending: orgsLoading } = useGetOrganizationsWithSubOrgs();
  const selectOrg = useSelectOrganization();
  const { data: user, isPending: userLoading } = useGetUser();
  const logout = useLogoutUser();

  const handleLogout = async () => {
    try {
      await logout.mutateAsync();
      navigate({ to: "/v4/login" });
    } catch (error) {
      console.error(error);
    }
  };

  const handleSelectOrganization = async (
    org: TOrgWithSubOrgs,
    subOrgId?: string,
    { needsFactorSetup }: { needsFactorSetup?: boolean } = {}
  ) => {
    const targetOrgId = subOrgId || org.id;
    const canBypassOrgAuth = org.bypassOrgAuthEnabled && isBreakglassRoute;

    if (isBreakglassRoute && !org.bypassOrgAuthEnabled) {
      toast.error("This organization does not have bypass org auth enabled");
      return;
    }

    if (!canBypassOrgAuth) {
      const ssoEnforcementError = getSsoEnforcementError(org);
      if (ssoEnforcementError) {
        toast.error(ssoEnforcementError);
        return;
      }
    }

    let result;
    try {
      result = await selectOrg.mutateAsync({
        organizationId: targetOrgId,
        userAgent: callbackPort ? UserAgentType.CLI : undefined
      });
    } catch (error: any) {
      if (error?.response?.data?.error === "SmtpError") {
        await handleLogout();
        return;
      }
      toast.error(error?.response?.data?.message || "Failed to select organization.");
      return;
    }

    await router.invalidate();
    const { token, isMfaEnabled, mfaMethod } = result;

    if (isMfaEnabled) {
      SecurityClient.setMfaToken(token);
      if (mfaMethod) setRequiredMfaMethod(mfaMethod);
      setShouldShowMfa(true);
      mfaOrgInfo.current = { rootOrg: org, subOrgId };
      return;
    }

    if (callbackPort) {
      let error: string | null = null;
      if (!user?.email) error = "User email not found";
      if (!token) error = "No token found";
      if (error) {
        toast.error(error);
        return;
      }
      sessionStorage.setItem(
        SessionStorageKeys.CLI_TERMINAL_TOKEN,
        JSON.stringify({
          expiry: formatISO(addSeconds(new Date(), 30)),
          data: window.btoa(
            JSON.stringify({ JTWToken: token, email: user?.email, privateKey: "" })
          ),
          callbackPort
        })
      );
      setAuthToken(token);
      navigate({ to: "/cli-redirect", search: { org_id: targetOrgId } });
      return;
    }

    setAuthToken(token);
    toast.success("Successfully logged in");
    if (needsFactorSetup) {
      navigate({ to: "/personal-settings", search: { selectedTab: "authentication" } });
      return;
    }
    if (redirectTo?.startsWith(`/organizations/${targetOrgId}/`)) {
      navigate({ href: toV4Href(redirectTo) });
      return;
    }
    localStorage.setItem("orgData.id", targetOrgId);
    navigate({ to: "/v4/organizations/$orgId/projects", params: { orgId: targetOrgId } });
  };

  const toastedError = useRef<string | null>(null);
  useEffect(() => {
    if (autoSelectErrorMessage && toastedError.current !== autoSelectErrorMessage) {
      toastedError.current = autoSelectErrorMessage;
      toast.error(autoSelectErrorMessage);
    }
  }, [autoSelectErrorMessage]);

  useEffect(() => {
    const rootOrg = orgs?.find((o) => o.id === orgId);
    const subOrgParent = rootOrg
      ? undefined
      : orgs?.find((o) => o.subOrganizations.some((sub) => sub.id === orgId));
    const mfaOrg = rootOrg ?? subOrgParent;
    const storedMfaToken = sessionStorage.getItem(SessionStorageKeys.MFA_TEMP_TOKEN);
    if (mfaMethodFromSearch && storedMfaToken && mfaOrg) {
      sessionStorage.removeItem(SessionStorageKeys.MFA_TEMP_TOKEN);
      SecurityClient.setMfaToken(storedMfaToken);
      setShouldShowMfa(true);
      mfaOrgInfo.current = { rootOrg: mfaOrg, subOrgId: rootOrg ? undefined : orgId };
    }
  }, [mfaMethodFromSearch, orgs?.length, orgId]);

  if (userLoading || !user) return <Loader size="page" label="Loading" className="flex-1" />;

  if (shouldShowMfa) {
    return (
      <Mfa
        email={user.email as string}
        method={requiredMfaMethod}
        onChangeAccount={handleLogout}
        successCallback={(options) =>
          mfaOrgInfo.current
            ? handleSelectOrganization(
                mfaOrgInfo.current.rootOrg,
                mfaOrgInfo.current.subOrgId,
                options
              )
            : undefined
        }
      />
    );
  }

  return (
    <SelectOrgView
      username={user.username}
      orgs={orgs ?? []}
      isLoading={orgsLoading}
      onSelect={handleSelectOrganization}
      onSignOut={handleLogout}
    />
  );
};

const MFA_PREVIEWS: Record<
  string,
  { method: MfaMethod; preview: "code" | "recovery" | "passkey" | "codes" }
> = {
  "mfa-email": { method: MfaMethod.EMAIL, preview: "code" },
  "mfa-totp": { method: MfaMethod.TOTP, preview: "code" },
  "mfa-recovery": { method: MfaMethod.TOTP, preview: "recovery" },
  "mfa-passkey": { method: MfaMethod.WEBAUTHN, preview: "passkey" },
  "mfa-recovery-codes": { method: MfaMethod.TOTP, preview: "codes" }
};

export const SelectOrgPage = () => {
  const preview = useAuthPreview();
  if (!preview) return <LiveSelectOrg />;
  const mfaPreview = MFA_PREVIEWS[preview];
  if (mfaPreview) {
    return (
      <Mfa
        email="ada@acme.dev"
        method={mfaPreview.method}
        preview={mfaPreview.preview}
        onChangeAccount={() => {}}
        successCallback={() => {}}
      />
    );
  }
  return (
    <SelectOrgView
      username="ada@acme.dev"
      orgs={PREVIEW_ORGS}
      isLoading={preview === "loading"}
      initialRootOrgId={preview === "sub-orgs" ? PREVIEW_ORGS[0].id : undefined}
      onSelect={() => {}}
      onSignOut={() => {}}
    />
  );
};
