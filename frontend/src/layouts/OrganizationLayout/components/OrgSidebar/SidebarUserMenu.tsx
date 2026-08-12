import { Link, useNavigate } from "@tanstack/react-router";
import {
  Book,
  Clipboard,
  ExternalLink,
  Info,
  LogOut,
  Settings,
  Slack,
  UserPlus
} from "lucide-react";

import { createNotification } from "@app/components/notifications";
import { OrgPermissionCan } from "@app/components/permissions";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  Tooltip,
  TooltipContent,
  TooltipTrigger
} from "@app/components/v3";
import {
  OrgPermissionActions,
  OrgPermissionSubjects,
  useOrganization,
  useUser
} from "@app/context";
import { useLogoutUser } from "@app/hooks/api";
import { getAuthToken } from "@app/hooks/api/reactQuery";

export const SidebarUserMenu = () => {
  const navigate = useNavigate();
  const { user } = useUser();
  const { currentOrg } = useOrganization();
  const logout = useLogoutUser();
  const displayName = [user.firstName, user.lastName].filter(Boolean).join(" ") || user.email;

  const handleCopyToken = async () => {
    try {
      await window.navigator.clipboard.writeText(getAuthToken());
      createNotification({ type: "success", text: "Copied current login session token" });
    } catch {
      createNotification({ type: "error", text: "Failed to copy user token" });
    }
  };

  const handleLogout = async () => {
    await logout.mutateAsync();
    navigate({ to: "/login" });
  };

  return (
    <SidebarMenu className="min-w-0 flex-1">
      <SidebarMenuItem>
        <DropdownMenu modal={false}>
          <DropdownMenuTrigger asChild>
            <SidebarMenuButton size="lg" tooltip={displayName} className="border border-border">
              <span className="flex size-6 shrink-0 items-center justify-center rounded-sm bg-foreground text-xs font-semibold text-background">
                {(user.firstName?.[0] ?? user.email?.[0] ?? "U").toUpperCase()}
              </span>
              <span className="min-w-0">
                <span className="block truncate font-medium text-foreground">{displayName}</span>
                <span className="block truncate text-xs text-muted">{user.email}</span>
              </span>
            </SidebarMenuButton>
          </DropdownMenuTrigger>
          <DropdownMenuContent side="right" align="end" sideOffset={8} className="min-w-64">
            <DropdownMenuItem asChild>
              <Link to="/personal-settings">
                <Settings />
                Personal Settings
              </Link>
            </DropdownMenuItem>
            <OrgPermissionCan I={OrgPermissionActions.Create} a={OrgPermissionSubjects.Member}>
              {(isAllowed) =>
                isAllowed ? (
                  <DropdownMenuItem asChild>
                    <Link
                      to="/organizations/$orgId/access-management"
                      params={{ orgId: currentOrg.id }}
                      search={{ selectedTab: "members", action: "invite-members" }}
                    >
                      <UserPlus />
                      Invite Users
                    </Link>
                  </DropdownMenuItem>
                ) : null
              }
            </OrgPermissionCan>
            <DropdownMenuSeparator />
            <DropdownMenuItem asChild>
              <a
                href="https://infisical.com/docs/documentation/getting-started/introduction"
                target="_blank"
                rel="noopener noreferrer"
              >
                <Book />
                Documentation
                <ExternalLink className="ml-auto size-3.5 opacity-50" />
              </a>
            </DropdownMenuItem>
            <DropdownMenuItem asChild>
              <a href="https://infisical.com/slack" target="_blank" rel="noopener noreferrer">
                <Slack />
                Join Slack Community
                <ExternalLink className="ml-auto size-3.5 opacity-50" />
              </a>
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem onSelect={handleCopyToken}>
              <Clipboard />
              Copy Token
              <Tooltip>
                <TooltipTrigger>
                  <Info className="size-3.5 opacity-50" />
                </TooltipTrigger>
                <TooltipContent className="max-w-xs">
                  This token is linked to your current login session and organization.
                </TooltipContent>
              </Tooltip>
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem onSelect={handleLogout}>
              <LogOut />
              Log Out
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </SidebarMenuItem>
    </SidebarMenu>
  );
};
