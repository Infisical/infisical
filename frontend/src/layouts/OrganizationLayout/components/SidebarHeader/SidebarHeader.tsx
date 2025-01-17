import { faCheck, faSignOut, faSort } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { useNavigate } from "@tanstack/react-router";

import {
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger
} from "@app/components/v2";
import { useOrganization } from "@app/context";
import { useGetOrganizations, useLogoutUser } from "@app/hooks/api";
import { AuthMethod } from "@app/hooks/api/users/types";

type Prop = {
  onChangeOrg: (orgId: string) => void;
};

export const SidebarHeader = ({ onChangeOrg }: Prop) => {
  const { currentOrg } = useOrganization();
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
    <div className="flex cursor-pointer items-center p-2 pt-4">
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <div className="flex w-full items-center justify-center rounded-md border border-mineshaft-600 p-1 transition-all duration-150 hover:bg-mineshaft-700">
            <div className="mr-2 flex h-8 w-8 items-center justify-center rounded-md bg-primary">
              {currentOrg?.name.charAt(0)}
            </div>
            <div className="flex flex-grow flex-col text-white">
              <div className="max-w-36 truncate text-ellipsis text-sm font-medium capitalize">
                {currentOrg?.name}
              </div>
              <div className="text-xs text-mineshaft-400">Free Plan</div>
            </div>
            <FontAwesomeIcon icon={faSort} className="text-xs text-mineshaft-400" />
          </div>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="p-1">
          <div className="px-2 py-1 text-xs capitalize text-mineshaft-400">organizations</div>
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
          <DropdownMenuItem onClick={logOutUser} icon={<FontAwesomeIcon icon={faSignOut} />}>
            Log Out
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
};
