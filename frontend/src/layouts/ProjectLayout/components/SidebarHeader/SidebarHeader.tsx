import {
  faAngleDown,
  faArrowLeft,
  faArrowUpRightFromSquare,
  faCheck
} from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { Link, useNavigate } from "@tanstack/react-router";

import {
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger
} from "@app/components/v2";
import { useOrganization, useUser } from "@app/context";
import { useGetOrganizations, useLogoutUser } from "@app/hooks/api";
import { AuthMethod } from "@app/hooks/api/users/types";

type Prop = {
  onChangeOrg: (orgId: string) => void;
};

export const SidebarHeader = ({ onChangeOrg }: Prop) => {
  const { currentOrg } = useOrganization();
  const { user } = useUser();
  const navigate = useNavigate();
  const { data: orgs } = useGetOrganizations();

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

  return (
    <div className="flex h-12 cursor-default items-center px-3 pt-6">
      <Link to="/organization/projects">
        <div className="pl-1 pr-2 text-mineshaft-400 duration-200 hover:text-mineshaft-100">
          <FontAwesomeIcon icon={faArrowLeft} />
        </div>
      </Link>
      <DropdownMenu>
        <DropdownMenuTrigger asChild className="max-w-[160px] data-[state=open]:bg-mineshaft-600">
          <div className="mr-auto flex items-center rounded-md py-1.5 pl-1.5 pr-2 hover:bg-mineshaft-600">
            <div className="flex h-5 w-5 min-w-[20px] items-center justify-center rounded-md bg-primary text-sm">
              {currentOrg?.name.charAt(0)}
            </div>
            <div
              className="overflow-hidden truncate text-ellipsis pl-2 text-sm text-mineshaft-100"
              style={{ maxWidth: "140px" }}
            >
              {currentOrg?.name}
            </div>
            <FontAwesomeIcon icon={faAngleDown} className="pl-1 pt-1 text-xs text-mineshaft-300" />
          </div>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="p-1">
          <div className="px-2 py-1 text-xs text-mineshaft-400">{user?.username}</div>
          {orgs?.map((org) => {
            return (
              <DropdownMenuItem key={org.id}>
                <Button
                  onClick={async () => {
                    if (currentOrg?.id === org.id) return;

                    if (org.authEnforced) {
                      // org has an org-level auth method enabled (e.g. SAML)
                      // -> logout + redirect to SAML SSO

                      await logout.mutateAsync();
                      if (org.orgAuthMethod === AuthMethod.OIDC) {
                        window.open(`/api/v1/sso/oidc/login?orgSlug=${org.slug}`);
                      } else {
                        window.open(`/api/v1/sso/redirect/saml2/organizations/${org.slug}`);
                      }
                      window.close();
                      return;
                    }

                    onChangeOrg(org?.id);
                  }}
                  variant="plain"
                  colorSchema="secondary"
                  size="xs"
                  className="flex w-full items-center justify-start p-0 font-normal"
                  leftIcon={
                    currentOrg?.id === org.id && (
                      <FontAwesomeIcon icon={faCheck} className="mr-3 text-primary" />
                    )
                  }
                >
                  <div className="flex w-full max-w-[150px] items-center justify-between truncate">
                    {org.name}
                  </div>
                </Button>
              </DropdownMenuItem>
            );
          })}

          <div className="mt-1 h-1 border-t border-mineshaft-600" />
          <button type="button" onClick={logOutUser} className="w-full">
            <DropdownMenuItem>Log Out</DropdownMenuItem>
          </button>
        </DropdownMenuContent>
      </DropdownMenu>
      <DropdownMenu>
        <DropdownMenuTrigger
          asChild
          className="p-1 hover:bg-primary-400 hover:text-black data-[state=open]:bg-primary-400 data-[state=open]:text-black"
        >
          <div
            className="child flex items-center justify-center rounded-full bg-mineshaft pr-1 text-mineshaft-300 hover:bg-mineshaft-500"
            style={{ fontSize: "11px", width: "26px", height: "26px" }}
          >
            {user?.firstName?.charAt(0)}
            {user?.lastName && user?.lastName?.charAt(0)}
          </div>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="p-1">
          <div className="px-2 py-1 text-xs text-mineshaft-400">{user?.username}</div>
          <Link to="/personal-settings">
            <DropdownMenuItem>Personal Settings</DropdownMenuItem>
          </Link>
          <a
            href="https://infisical.com/docs/documentation/getting-started/introduction"
            target="_blank"
            rel="noopener noreferrer"
            className="mt-3 w-full text-sm font-normal leading-[1.2rem] text-mineshaft-300 hover:text-mineshaft-100"
          >
            <DropdownMenuItem>
              Documentation
              <FontAwesomeIcon
                icon={faArrowUpRightFromSquare}
                className="mb-[0.06rem] pl-1.5 text-xxs"
              />
            </DropdownMenuItem>
          </a>
          <a
            href="https://infisical.com/slack"
            target="_blank"
            rel="noopener noreferrer"
            className="mt-3 w-full text-sm font-normal leading-[1.2rem] text-mineshaft-300 hover:text-mineshaft-100"
          >
            <DropdownMenuItem>
              Join Slack Community
              <FontAwesomeIcon
                icon={faArrowUpRightFromSquare}
                className="mb-[0.06rem] pl-1.5 text-xxs"
              />
            </DropdownMenuItem>
          </a>
          {user?.superAdmin && (
            <Link to="/admin">
              <DropdownMenuItem className="mt-1 border-t border-mineshaft-600">
                Server Admin Console
              </DropdownMenuItem>
            </Link>
          )}
          <Link to="/organization/admin">
            <DropdownMenuItem className="mt-1 border-t border-mineshaft-600">
              Organization Admin Console
            </DropdownMenuItem>
          </Link>
          <div className="mt-1 h-1 border-t border-mineshaft-600" />
          <button type="button" onClick={logOutUser} className="w-full">
            <DropdownMenuItem>Log Out</DropdownMenuItem>
          </button>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
};
