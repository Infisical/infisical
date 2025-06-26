import { useState } from "react";
import { faGithub, faSlack } from "@fortawesome/free-brands-svg-icons";
import {
  faArrowUpRightFromSquare,
  faBook,
  faCheck,
  faCheckCircle,
  faCog,
  faDoorClosed,
  faEnvelope,
  faInfinity,
  faInfo,
  faInfoCircle,
  faMoneyBill,
  faPlug,
  faSignOut,
  faUser,
  faUserCog,
  faUsers
} from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { useQueryClient } from "@tanstack/react-query";
import { Link, linkOptions, useLocation, useNavigate, useRouter } from "@tanstack/react-router";

import { Mfa } from "@app/components/auth/Mfa";
import { CreateOrgModal } from "@app/components/organization/CreateOrgModal";
import SecurityClient from "@app/components/utilities/SecurityClient";
import {
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
  Menu,
  MenuGroup,
  MenuItem,
  Modal,
  ModalContent,
  Tooltip
} from "@app/components/v2";
import { envConfig } from "@app/config/env";
import { useOrganization, useSubscription, useUser } from "@app/context";
import { isInfisicalCloud } from "@app/helpers/platform";
import { usePopUp, useToggle } from "@app/hooks";
import {
  useGetOrganizations,
  useGetOrgTrialUrl,
  useLogoutUser,
  useSelectOrganization,
  workspaceKeys
} from "@app/hooks/api";
import { authKeys } from "@app/hooks/api/auth/queries";
import { MfaMethod } from "@app/hooks/api/auth/types";
import { SubscriptionPlan } from "@app/hooks/api/types";
import { AuthMethod } from "@app/hooks/api/users/types";
import { ProjectType } from "@app/hooks/api/workspace/types";
import { navigateUserToOrg } from "@app/pages/auth/LoginPage/Login.utils";

import { MenuIconButton } from "../MenuIconButton";
import { ServerAdminsPanel } from "../ServerAdminsPanel/ServerAdminsPanel";

const getPlan = (subscription: SubscriptionPlan) => {
  if (subscription.groups) return "Enterprise Plan";
  if (subscription.pitRecovery) return "Pro Plan";
  return "Free Plan";
};

export const INFISICAL_SUPPORT_OPTIONS = [
  [
    <FontAwesomeIcon key={1} className="pr-4 text-sm" icon={faSlack} />,
    "Support Forum",
    "https://infisical.com/slack"
  ],
  [
    <FontAwesomeIcon key={2} className="pr-4 text-sm" icon={faBook} />,
    "Read Docs",
    "https://infisical.com/docs/documentation/getting-started/introduction"
  ],
  [
    <FontAwesomeIcon key={3} className="pr-4 text-sm" icon={faGithub} />,
    "GitHub Issues",
    "https://github.com/Infisical/infisical/issues"
  ],
  [
    <FontAwesomeIcon key={4} className="pr-4 text-sm" icon={faEnvelope} />,
    "Email Support",
    "mailto:support@infisical.com"
  ],
  [
    <FontAwesomeIcon key={5} className="pr-4 text-sm" icon={faUsers} />,
    "Instance Admins",
    "server-admins"
  ]
];

export const OrgSidebar = () => {
  const [shouldShowMfa, toggleShowMfa] = useToggle(false);
  const [requiredMfaMethod, setRequiredMfaMethod] = useState(MfaMethod.EMAIL);
  const [mfaSuccessCallback, setMfaSuccessCallback] = useState<() => void>(() => {});
  const { subscription } = useSubscription();
  const [open, setOpen] = useState(false);
  const [openSupport, setOpenSupport] = useState(false);
  const [openUser, setOpenUser] = useState(false);
  const [openOrg, setOpenOrg] = useState(false);
  const [showAdminsModal, setShowAdminsModal] = useState(false);

  const { user } = useUser();
  const { mutateAsync } = useGetOrgTrialUrl();

  const { currentOrg } = useOrganization();
  const { data: orgs } = useGetOrganizations();

  const { popUp, handlePopUpToggle } = usePopUp(["createOrg"] as const);
  const { mutateAsync: selectOrganization } = useSelectOrganization();
  const navigate = useNavigate();
  const router = useRouter();
  const location = useLocation();
  const queryClient = useQueryClient();

  const isMoreSelected = (
    [
      linkOptions({ to: "/organization/access-management" }).to,
      linkOptions({ to: "/organization/app-connections" }).to,
      linkOptions({ to: "/organization/billing" }).to,
      linkOptions({ to: "/organization/sso" }).to,
      linkOptions({ to: "/organization/gateways" }).to,
      linkOptions({ to: "/organization/settings" }).to,
      linkOptions({ to: "/organization/audit-logs" }).to
    ] as string[]
  ).includes(location.pathname);

  const handleOrgChange = async (orgId: string) => {
    queryClient.removeQueries({ queryKey: authKeys.getAuthToken });
    queryClient.removeQueries({ queryKey: workspaceKeys.getAllUserWorkspace() });

    const { token, isMfaEnabled, mfaMethod } = await selectOrganization({
      organizationId: orgId
    });

    if (isMfaEnabled) {
      SecurityClient.setMfaToken(token);
      if (mfaMethod) {
        setRequiredMfaMethod(mfaMethod);
      }
      toggleShowMfa.on();
      setMfaSuccessCallback(() => () => handleOrgChange(orgId));
      return;
    }
    await router.invalidate();
    await navigateUserToOrg(navigate, orgId);
  };

  const logout = useLogoutUser();
  const logOutUser = async () => {
    try {
      console.log("Logging out...");
      await logout.mutateAsync();
      navigate({ to: "/login" });
    } catch (error) {
      console.error(error);
    }
  };

  if (shouldShowMfa) {
    return (
      <div className="flex max-h-screen min-h-screen flex-col items-center justify-center gap-2 overflow-y-auto bg-gradient-to-tr from-mineshaft-600 via-mineshaft-800 to-bunker-700">
        <Mfa
          email={user.email as string}
          method={requiredMfaMethod}
          successCallback={mfaSuccessCallback}
          closeMfa={() => toggleShowMfa.off()}
        />
      </div>
    );
  }

  return (
    <>
      <aside className="dark z-10 w-60 border-r border-mineshaft-600 bg-gradient-to-tr from-mineshaft-700 via-mineshaft-800 to-mineshaft-900 transition-all duration-150">
        <nav className="items-between flex h-full flex-col justify-between overflow-y-auto dark:[color-scheme:dark]">
          <Menu>
            <MenuGroup title="Overview">
              <Link to="/organization/secret-manager/overview">
                {({ isActive }) => (
                  <MenuItem isSelected={isActive} icon="notification-bell">
                    Projects
                  </MenuItem>
                )}
              </Link>
              <Link to="/organization/secret-sharing">
                {({ isActive }) => (
                  <MenuItem isSelected={isActive} icon="lock-closed">
                    Share Secret
                  </MenuItem>
                )}
              </Link>
              <Link to="/organization/access-management">
                {({ isActive }) => (
                  <MenuItem isSelected={isActive}>
                    <div className="mx-1">
                      <FontAwesomeIcon icon={faUsers} className="mr-4" />
                      Access Control
                    </div>
                  </MenuItem>
                )}
              </Link>
              <Link to="/organization/app-connections">
                {({ isActive }) => (
                  <MenuItem isSelected={isActive}>
                    <div className="mx-1">
                      <FontAwesomeIcon icon={faPlug} className="mr-4" />
                      App Connections
                    </div>
                  </MenuItem>
                )}
              </Link>
              <Link to="/organization/gateways">
                {({ isActive }) => (
                  <MenuItem isSelected={isActive}>
                    <div className="mx-1">
                      <FontAwesomeIcon icon={faDoorClosed} className="mr-4" />
                      Gateways
                    </div>
                  </MenuItem>
                )}
              </Link>
              <Link to="/organization/billing">
                {({ isActive }) => (
                  <MenuItem isSelected={isActive}>
                    <div className="mx-1">
                      <FontAwesomeIcon icon={faMoneyBill} className="mr-4" />
                      Usage & Billing
                    </div>
                  </MenuItem>
                )}
              </Link>
              <Link to="/organization/audit-logs">
                {({ isActive }) => (
                  <MenuItem isSelected={isActive}>
                    <div className="mx-1">
                      <FontAwesomeIcon icon={faBook} className="mr-4" />
                      Audit Logs
                    </div>
                  </MenuItem>
                )}
              </Link>
              <Link to="/organization/sso">
                {({ isActive }) => (
                  <MenuItem isSelected={isActive}>
                    <div className="mx-1">
                      <FontAwesomeIcon icon={faCheckCircle} className="mr-4" />
                      SSO Settings
                    </div>
                  </MenuItem>
                )}
              </Link>
              <Link to="/organization/settings">
                {({ isActive }) => (
                  <MenuItem isSelected={isActive}>
                    <div className="mx-1">
                      <FontAwesomeIcon icon={faCog} className="mr-4" />
                      Organization Settings
                    </div>
                  </MenuItem>
                )}
              </Link>
            </MenuGroup>
            <MenuGroup title="Admin Panels">
              {user?.superAdmin && (
                <Link to="/admin">
                  {({ isActive }) => (
                    <MenuItem isSelected={isActive}>
                      <div className="mx-1">
                        <FontAwesomeIcon icon={faUserCog} className="mr-4" />
                        Server Admin Console
                      </div>
                    </MenuItem>
                  )}
                </Link>
              )}
              <Link to="/organization/admin">
                {({ isActive }) => (
                  <MenuItem isSelected={isActive}>
                    <div className="mx-1">
                      <FontAwesomeIcon icon={faCog} className="mr-4" />
                      Org Admin Console
                    </div>
                  </MenuItem>
                )}
              </Link>
            </MenuGroup>
          </Menu>
          <div
            className={`relative mt-10 ${
              subscription && subscription.slug === "starter" && !subscription.has_used_trial
                ? "mb-2"
                : "mb-4"
            } flex w-full cursor-default flex-col items-center px-1 text-sm text-mineshaft-400`}
          >
            {subscription && subscription.slug === "starter" && !subscription.has_used_trial && (
              <Tooltip content="Start Free Pro Trial" side="right">
                <button
                  type="button"
                  onClick={async () => {
                    if (!subscription || !currentOrg) return;

                    // direct user to start pro trial
                    const url = await mutateAsync({
                      orgId: currentOrg.id,
                      success_url: window.location.href
                    });

                    window.location.href = url;
                  }}
                  className="mt-1.5 w-full"
                >
                  <div className="justify-left mb-1.5 mt-1.5 flex w-full flex-col items-center rounded-md p-1 text-xs text-mineshaft-300 transition-all duration-150 hover:bg-mineshaft-500 hover:text-primary-400">
                    <FontAwesomeIcon icon={faInfinity} className="py-2 text-lg text-primary" />
                    Pro Trial
                  </div>
                </button>
              </Tooltip>
            )}
          </div>
        </nav>
      </aside>
      <Modal isOpen={showAdminsModal} onOpenChange={setShowAdminsModal}>
        <ModalContent title="Server Administrators" subTitle="View all server administrators">
          <div className="mb-2">
            <ServerAdminsPanel />
          </div>
        </ModalContent>
      </Modal>
      <CreateOrgModal
        isOpen={popUp?.createOrg?.isOpen}
        onClose={() => handlePopUpToggle("createOrg", false)}
      />
    </>
  );
};
