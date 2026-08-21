import {
  forwardRef,
  Fragment,
  ReactNode,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState
} from "react";
import { useTranslation } from "react-i18next";
import { useNavigate, useRouteContext, useRouter, useSearch } from "@tanstack/react-router";
import { addSeconds, format, formatISO } from "date-fns";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { ArrowRight, ChevronRight, Search } from "lucide-react";

import { AuthPageLayout } from "@app/components/auth/AuthPageLayout";
import { AuthPagePanel } from "@app/components/auth/AuthPagePanel";
import { Mfa } from "@app/components/auth/Mfa";
import { createNotification } from "@app/components/notifications";
import SecurityClient from "@app/components/utilities/SecurityClient";
import { ContentLoader, Spinner } from "@app/components/v2";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
  ScrollableContent,
  VerificationCodeHeader
} from "@app/components/v3";
import { cn } from "@app/components/v3/utils";
import { SessionStorageKeys } from "@app/const";
import { ROUTE_PATHS } from "@app/const/routes";
import { useToggle } from "@app/hooks";
import {
  TOrgWithSubOrgs,
  useGetOrganizationsWithSubOrgs,
  useGetUser,
  useLogoutUser,
  useSelectOrganization
} from "@app/hooks/api";
import { MfaMethod, UserAgentType } from "@app/hooks/api/auth/types";
import { setAuthToken } from "@app/hooks/api/reactQuery";

import { navigateUserToOrg } from "../LoginPage/Login.utils";
import { getSsoEnforcementError } from "./SelectOrg.utils";

type OrgCardProps = {
  name: string;
  label?: string;
  joinedAt?: string | null;
  onClick: () => void;
  footer?: ReactNode;
};

const OrgCard = forwardRef<HTMLButtonElement, OrgCardProps>(
  ({ name, label, joinedAt, onClick, footer }, ref) => (
    <div className="overflow-hidden rounded-lg border border-border bg-card">
      <button
        ref={ref}
        type="button"
        onClick={onClick}
        aria-label={`Login to ${name}`}
        className="group grid w-full cursor-pointer grid-cols-[minmax(0,1fr)_auto] items-center gap-3 p-4 text-left transition-colors hover:bg-container-hover focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none focus-visible:ring-inset"
      >
        <span className="min-w-0">
          <span className="block truncate text-sm font-medium text-foreground">{name}</span>
          {(label || joinedAt) && (
            <span className="block text-sm leading-relaxed text-muted">
              {label}
              {label && joinedAt && " · "}
              {joinedAt && <>Member since {format(new Date(joinedAt), "MMM d, yyyy")}</>}
            </span>
          )}
        </span>
        <ArrowRight className="size-4 self-center text-muted transition-all group-hover:translate-x-0.5 group-hover:text-foreground" />
      </button>
      {footer}
    </div>
  )
);

OrgCard.displayName = "OrgCard";

// Mirrors the step transition on the server admin onboarding (OnboardingPageLayout)
type ViewTransitionContext = {
  direction: number;
  prefersReducedMotion: boolean;
};

const viewTransitionVariants = {
  enter: ({ direction, prefersReducedMotion }: ViewTransitionContext) =>
    prefersReducedMotion
      ? {
          opacity: 0
        }
      : {
          transform: `translate3d(${direction * 32}px, 0, 0) scale(1.01)`,
          opacity: 0.28
        },
  center: {
    transform: "translate3d(0, 0, 0) scale(1)",
    opacity: 1
  },
  exit: {
    opacity: 0,
    transition: {
      duration: 0
    }
  }
};

// Fixed (viewport-adaptive) list height — matches ScrollableContent's lg max-height clamp —
// so filtering or switching views never reflows the vertically-centered header and search
const listHeightClass = "h-[clamp(12rem,calc(100dvh_-_24rem),28rem)]";

export const SelectOrgPage = () => {
  const navigate = useNavigate();
  const { t } = useTranslation();
  const router = useRouter();
  const search = useSearch({ from: ROUTE_PATHS.Auth.SelectOrgPage.id });
  const { autoSelectErrorMessage } = useRouteContext({ from: ROUTE_PATHS.Auth.SelectOrgPage.id });

  const {
    org_id: orgId,
    callback_port: callbackPort,
    is_admin_login: isBreakglassRoute,
    mfa_method: mfaMethodFromSearch
  } = search;

  const { data: orgs, isPending: orgsLoading } = useGetOrganizationsWithSubOrgs();
  const selectOrg = useSelectOrganization();
  const { data: user, isPending: userLoading } = useGetUser();
  const logout = useLogoutUser();

  const [shouldShowMfa, toggleShowMfa] = useToggle(false);
  const [requiredMfaMethod, setRequiredMfaMethod] = useState(
    mfaMethodFromSearch ?? MfaMethod.EMAIL
  );
  const [selectedRootOrg, setSelectedRootOrg] = useState<TOrgWithSubOrgs | null>(null);
  const [searchTerm, setSearchTerm] = useState("");
  const mfaOrgInfo = useRef<{ rootOrg: TOrgWithSubOrgs; subOrgId?: string } | null>(null);

  const prefersReducedMotion = useReducedMotion();
  const viewDepth = selectedRootOrg ? 1 : 0;
  const previousViewDepthRef = useRef(viewDepth);
  let viewDirection = 0;
  if (viewDepth > previousViewDepthRef.current) {
    viewDirection = 1;
  } else if (viewDepth < previousViewDepthRef.current) {
    viewDirection = -1;
  }

  useEffect(() => {
    previousViewDepthRef.current = viewDepth;
  }, [viewDepth]);

  const viewTransitionContext: ViewTransitionContext = {
    direction: viewDirection,
    prefersReducedMotion: Boolean(prefersReducedMotion)
  };

  // A view switch unmounts the focused control, dropping keyboard focus to <body>.
  // Focus the drilled-into org's card on entry and restore the originating
  // "View sub-organizations" control on return.
  const rootOrgCardRef = useRef<HTMLButtonElement | null>(null);
  const subOrgStripRefs = useRef(new Map<string, HTMLButtonElement>());
  const returnFocusOrgIdRef = useRef<string | null>(null);

  useEffect(() => {
    if (selectedRootOrg) {
      rootOrgCardRef.current?.focus();
    } else if (returnFocusOrgIdRef.current) {
      subOrgStripRefs.current.get(returnFocusOrgIdRef.current)?.focus();
      returnFocusOrgIdRef.current = null;
    }
  }, [selectedRootOrg]);

  const handleLogout = useCallback(async () => {
    try {
      await logout.mutateAsync();
      navigate({ to: "/login" });
    } catch (error) {
      console.error(error);
    }
  }, [logout, navigate]);

  const filteredOrgs = useMemo(() => {
    if (!orgs) return [];
    if (!searchTerm.trim()) return orgs;

    const term = searchTerm.toLowerCase();
    return orgs
      .filter(
        (org) =>
          org.name.toLowerCase().includes(term) ||
          org.subOrganizations.some((sub) => sub.name.toLowerCase().includes(term))
      )
      .map((org) => ({
        ...org,
        subOrganizations: org.name.toLowerCase().includes(term)
          ? org.subOrganizations
          : org.subOrganizations.filter((sub) => sub.name.toLowerCase().includes(term))
      }));
  }, [orgs, searchTerm]);

  const filteredSubOrgs = useMemo(() => {
    if (!selectedRootOrg) return [];
    if (!searchTerm.trim()) return selectedRootOrg.subOrganizations;
    const term = searchTerm.toLowerCase();
    return selectedRootOrg.subOrganizations.filter((sub) => sub.name.toLowerCase().includes(term));
  }, [selectedRootOrg, searchTerm]);

  // For sub-orgs, inherit the root org's SSO settings but override the ID
  const handleSelectOrganization = async (org: TOrgWithSubOrgs, subOrgId?: string) => {
    const targetOrgId = subOrgId || org.id;
    const canBypassOrgAuth = org.bypassOrgAuthEnabled && isBreakglassRoute;

    if (isBreakglassRoute && !org.bypassOrgAuthEnabled) {
      createNotification({
        text: "This organization does not have bypass org auth enabled",
        type: "error"
      });
      return;
    }

    if (!canBypassOrgAuth) {
      const ssoEnforcementError = getSsoEnforcementError(org);
      if (ssoEnforcementError) {
        createNotification({ text: ssoEnforcementError, type: "error" });
        return;
      }
    }

    let token;
    let isMfaEnabled;
    let mfaMethod;

    try {
      const result = await selectOrg.mutateAsync({
        organizationId: targetOrgId,
        userAgent: callbackPort ? UserAgentType.CLI : undefined
      });
      token = result.token;
      isMfaEnabled = result.isMfaEnabled;
      mfaMethod = result.mfaMethod;
    } catch (error: any) {
      if (error?.response?.data?.error === "SmtpError") {
        // Global MutationCache.onError already showed the SMTP error toast — just log out silently.
        await handleLogout();
        return;
      }
      const message = error?.response?.data?.message || "Failed to select organization.";
      createNotification({ text: message, type: "error" });
      return;
    }

    await router.invalidate();

    if (isMfaEnabled) {
      SecurityClient.setMfaToken(token);
      if (mfaMethod) {
        setRequiredMfaMethod(mfaMethod);
      }
      toggleShowMfa.on();
      mfaOrgInfo.current = { rootOrg: org, subOrgId };
      return;
    }

    if (callbackPort) {
      let error: string | null = null;

      if (!user?.email) error = "User email not found";
      if (!token) error = "No token found";

      if (error) {
        createNotification({ text: error, type: "error" });
        return;
      }

      const payload = {
        JTWToken: token,
        email: user?.email,
        privateKey: ""
      };

      sessionStorage.setItem(
        SessionStorageKeys.CLI_TERMINAL_TOKEN,
        JSON.stringify({
          expiry: formatISO(addSeconds(new Date(), 30)),
          data: window.btoa(JSON.stringify(payload)),
          callbackPort
        })
      );
      navigate({ to: "/cli-redirect" });
    } else {
      setAuthToken(token);
      createNotification({ text: "Successfully logged in", type: "success" });
      navigateUserToOrg({ navigate, organizationId: targetOrgId });
    }
  };

  // beforeLoad can't toast on cold loads (Toaster not yet mounted) so it hands failures here;
  // the ref dedupes StrictMode's double effect run
  const autoSelectErrorToasted = useRef<string | null>(null);
  useEffect(() => {
    if (autoSelectErrorMessage && autoSelectErrorToasted.current !== autoSelectErrorMessage) {
      autoSelectErrorToasted.current = autoSelectErrorMessage;
      createNotification({ text: autoSelectErrorMessage, type: "error" });
    }
  }, [autoSelectErrorMessage]);

  // MFA challenge handed off by beforeLoad's auto-select
  // eslint-disable-next-line react-hooks/exhaustive-deps
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
      toggleShowMfa.on();
      mfaOrgInfo.current = { rootOrg: mfaOrg, subOrgId: rootOrg ? undefined : orgId };
    }
  }, [mfaMethodFromSearch, orgs?.length, orgId]);

  const renderListContent = () => {
    if (orgsLoading) {
      return (
        <div className="flex justify-center py-6">
          <Spinner size="sm" />
        </div>
      );
    }

    if (filteredOrgs.length === 0) {
      return <p className="py-4 text-center text-sm text-muted">No organizations found</p>;
    }

    const isSearching = Boolean(searchTerm.trim());

    return (
      <div className="flex flex-col gap-3">
        {filteredOrgs.map((org) => (
          <Fragment key={org.id}>
            <OrgCard
              name={org.name}
              joinedAt={org.userJoinedAt}
              onClick={() => handleSelectOrganization(org)}
              footer={
                !isSearching && org.subOrganizations.length > 0 ? (
                  <button
                    type="button"
                    ref={(el) => {
                      if (el) {
                        subOrgStripRefs.current.set(org.id, el);
                      } else {
                        subOrgStripRefs.current.delete(org.id);
                      }
                    }}
                    onClick={() => {
                      returnFocusOrgIdRef.current = org.id;
                      setSelectedRootOrg(org);
                    }}
                    aria-label={`View sub-organizations of ${org.name}`}
                    className="flex w-full cursor-pointer items-center gap-1.5 border-t border-border bg-container px-4 py-2 text-left text-xs text-muted transition-colors hover:bg-container-hover hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none focus-visible:ring-inset"
                  >
                    <ChevronRight className="size-3.5" />
                    View {org.subOrganizations.length} sub-organization
                    {org.subOrganizations.length !== 1 ? "s" : ""}
                  </button>
                ) : undefined
              }
            />
            {/* While searching, surface matching sub-orgs inline so they stay discoverable */}
            {isSearching && org.subOrganizations.length > 0 && (
              <div className="ml-4 flex flex-col gap-3 border-l border-border pl-4">
                <p className="px-1 pt-1 font-jetbrains-mono text-xs tracking-widest text-muted uppercase">
                  Sub-organizations
                </p>
                {org.subOrganizations.map((sub) => (
                  <OrgCard
                    key={sub.id}
                    name={sub.name}
                    joinedAt={sub.userJoinedAt}
                    onClick={() => handleSelectOrganization(org, sub.id)}
                  />
                ))}
              </div>
            )}
          </Fragment>
        ))}
      </div>
    );
  };

  const renderSubOrgContent = () => {
    if (!selectedRootOrg) return null;

    return (
      <div className="flex flex-col gap-3">
        <OrgCard
          ref={rootOrgCardRef}
          name={selectedRootOrg.name}
          label="Root organization"
          joinedAt={selectedRootOrg.userJoinedAt}
          onClick={() => handleSelectOrganization(selectedRootOrg)}
        />
        <p className="px-1 pt-1 font-jetbrains-mono text-xs tracking-widest text-muted uppercase">
          Sub-organizations
        </p>
        {filteredSubOrgs.length === 0 ? (
          <p className="py-4 text-center text-sm text-muted">No sub-organizations found</p>
        ) : (
          filteredSubOrgs.map((sub) => (
            <OrgCard
              key={sub.id}
              name={sub.name}
              joinedAt={sub.userJoinedAt}
              onClick={() => handleSelectOrganization(selectedRootOrg, sub.id)}
            />
          ))
        )}
      </div>
    );
  };

  if (userLoading || !user) {
    return (
      <div className="h-screen w-screen bg-bunker-800">
        <ContentLoader />
      </div>
    );
  }

  if (shouldShowMfa) {
    return (
      <>
        <>
          <title>{t("common.head-title", { title: t("login.title") })}</title>
          <link rel="icon" href="/infisical.ico" />
          <meta property="og:image" content="/images/message.png" />
          <meta property="og:title" content={t("login.og-title") ?? ""} />
          <meta name="og:description" content={t("login.og-description") ?? ""} />
        </>
        <Mfa
          email={user.email as string}
          successCallback={() => {
            if (mfaOrgInfo.current) {
              handleSelectOrganization(mfaOrgInfo.current.rootOrg, mfaOrgInfo.current.subOrgId);
            }
          }}
          method={requiredMfaMethod as MfaMethod}
          onChangeAccount={handleLogout}
        />
      </>
    );
  }

  return (
    <AuthPageLayout variant="focused" showFooter={false}>
      <>
        <title>{t("common.head-title", { title: t("login.title") })}</title>
        <link rel="icon" href="/infisical.ico" />
        <meta property="og:image" content="/images/message.png" />
        <meta property="og:title" content={t("login.og-title") ?? ""} />
        <meta name="og:description" content={t("login.og-description") ?? ""} />
      </>
      <AuthPagePanel>
        <VerificationCodeHeader
          title="Choose your organization as"
          recipient={user.username}
          action={
            <button
              aria-label={`Sign out ${user.username}`}
              className="shrink-0 cursor-pointer text-sm text-foreground/95 underline decoration-project/60 underline-offset-2 transition-colors duration-200 hover:decoration-project"
              onClick={handleLogout}
              type="button"
            >
              Sign out
            </button>
          }
        />

        <div className="flex flex-col gap-4">
          <InputGroup variant="outlined">
            <InputGroupAddon align="inline-start">
              <Search />
            </InputGroupAddon>
            <InputGroupInput
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder={
                selectedRootOrg ? "Search sub-organizations..." : "Search organizations..."
              }
              aria-label={selectedRootOrg ? "Search sub-organizations" : "Search organizations"}
            />
          </InputGroup>

          <div className="relative -m-2 overflow-hidden p-2">
            <AnimatePresence mode="popLayout" initial={false} custom={viewTransitionContext}>
              <motion.div
                key={selectedRootOrg?.id ?? "all-organizations"}
                custom={viewTransitionContext}
                variants={viewTransitionVariants}
                initial="enter"
                animate="center"
                exit="exit"
                transition={{
                  duration: prefersReducedMotion ? 0.12 : 0.18,
                  ease: [0.23, 1, 0.32, 1]
                }}
                className="w-full will-change-transform"
              >
                {selectedRootOrg ? (
                  <div className={cn("flex flex-col gap-4", listHeightClass)}>
                    <Breadcrumb>
                      <BreadcrumbList>
                        <BreadcrumbItem>
                          <BreadcrumbLink asChild>
                            <button
                              type="button"
                              className="focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                              onClick={() => {
                                setSelectedRootOrg(null);
                                setSearchTerm("");
                              }}
                            >
                              All organizations
                            </button>
                          </BreadcrumbLink>
                        </BreadcrumbItem>
                        <BreadcrumbSeparator />
                        <BreadcrumbItem>
                          <BreadcrumbPage>{selectedRootOrg.name}</BreadcrumbPage>
                        </BreadcrumbItem>
                      </BreadcrumbList>
                    </Breadcrumb>

                    <ScrollableContent
                      aria-label={`${selectedRootOrg.name} sub-organizations`}
                      edgeBehavior="fade"
                      outline={false}
                      containerClassName="min-h-0 flex-1"
                      className="h-full"
                      // The list is full of focusable cards, so the scroll region
                      // itself doesn't need to be a tab stop
                      tabIndex={-1}
                    >
                      {renderSubOrgContent()}
                    </ScrollableContent>
                  </div>
                ) : (
                  <ScrollableContent
                    aria-label="Your organizations"
                    edgeBehavior="fade"
                    outline={false}
                    containerClassName={listHeightClass}
                    className="h-full"
                    // The list is full of focusable cards, so the scroll region
                    // itself doesn't need to be a tab stop
                    tabIndex={-1}
                  >
                    {renderListContent()}
                  </ScrollableContent>
                )}
              </motion.div>
            </AnimatePresence>
          </div>
        </div>
      </AuthPagePanel>
    </AuthPageLayout>
  );
};
