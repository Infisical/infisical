import { type ReactNode, useState } from "react";
import { type Announcement, Announcements } from "@infisical/cipher/ui/announcements";
import { Button } from "@infisical/cipher/ui/button";
import type { SidebarHelp } from "@infisical/cipher/ui/sidebar";
import { Meta } from "@infisical/cipher/ui/text";
import { Tooltip } from "@infisical/cipher/ui/tooltip";
import type { ShellMenuEntry, TopBarAccount } from "@infisical/cipher/ui/top-bar";
import { useNavigate, useRouterState } from "@tanstack/react-router";
import { BookOpen, Github, LogOut, Mail, MessagesSquare, Users } from "lucide-react";

import {
  OrgPermissionMemberActions,
  OrgPermissionSubjects
} from "@app/context/OrgPermissionContext/types";
import { isInfisicalCloud } from "@app/helpers/platform";
import { toV3Href } from "@app/helpers/v4Bridge";
import type { TAnnouncement } from "@app/hooks/api/announcement/types";

import { accessLinks } from "../access/links";
import { failed, toast } from "../access/toast";
import { copyText } from "../clipboard";
import { useV4Adapter, useV4Mode } from "../data/adapters";
import { useV4Session } from "../data/session/contract";
import { useGo, v4Path } from "../links";
import { useV4ThemeChoice } from "../useV4Theme";
import { ServerAdminsDialog } from "./server-admins";

const publishedDate = (iso: string, options: Intl.DateTimeFormatOptions) => {
  const date = new Date(iso);
  return Number.isNaN(date.getTime())
    ? ""
    : new Intl.DateTimeFormat(undefined, options).format(date);
};

const safeLink = (link: string | null) => {
  if (!link) return undefined;
  try {
    return ["http:", "https:"].includes(new URL(link).protocol) ? link : undefined;
  } catch {
    return undefined;
  }
};

const toAnnouncement = (item: TAnnouncement): Announcement => {
  const href = safeLink(item.link);
  return {
    id: item.id,
    eyebrow: publishedDate(item.published, { year: "numeric", month: "long", day: "numeric" }),
    title: item.title,
    description: item.body,
    media: item.imageUrl ? <img src={item.imageUrl} alt="" /> : undefined,
    action: href ? { label: item.linkLabel || "Learn more", href, external: true } : undefined
  };
};

const supportEmailHref = (orgId: string, rootOrgId?: string | null) => {
  const body = `Hello Infisical Support Team,

Issue Details:
[What you did]
[What you expected to happen]
[What actually happened]
[Any error request IDs]
[Any supporting screenshots or video recording of the issue/request at hand]

Account Info:
- Organization ID: ${orgId}
${rootOrgId ? `- Root Organization ID: ${rootOrgId}` : ""}
- Domain: ${window.location.origin}

Thank you,
[Your Name]`;
  return `mailto:support@infisical.com?body=${encodeURIComponent(body)}`;
};

const useVersion = (): { label?: string; badge: ReactNode } => {
  const shell = useV4Adapter("shell");
  const version = shell.usePlatformVersion();
  const { data: serverConfig } = shell.useServerConfig();
  if (!version) return { badge: null };
  const latest = serverConfig?.latestAvailableVersion;
  if (!latest) return { label: version, badge: <Meta mono>{`v${version}`}</Meta> };
  return {
    label: `${version} (v${latest} available)`,
    badge: (
      <Tooltip content={`v${version} to v${latest}`} side="bottom">
        <Button variant="link" underline="hover" size="sm" asChild>
          <a href="https://upgrade.infisical.com/" target="_blank" rel="noopener noreferrer">
            New version available
          </a>
        </Button>
      </Tooltip>
    )
  };
};

export const useShellChrome = () => {
  const { user, organization } = useV4Session();
  const orgId = organization.id;
  const inServerConsole = useRouterState({
    select: (state) => toV3Href(state.location.pathname).startsWith("/admin")
  });
  const navigate = useNavigate();
  const org = useV4Adapter("org");
  const live = useV4Mode() === "live";
  const logout = org.useLogout();
  const { data: orgPermission } = useV4Adapter("access").useOrgPermission({ orgId });
  const { theme, setTheme } = useV4ThemeChoice("profile-menu");
  const go = useGo();
  const canInvite = Boolean(
    orgPermission?.permission.can(OrgPermissionMemberActions.Create, OrgPermissionSubjects.Member)
  );
  const copyToken = async () => {
    if (await copyText(org.getSessionToken(), "Failed to copy user token to clipboard")) {
      toast({ tone: "ok", title: "Copied current login session token to clipboard" });
    }
  };
  const logOut = async () => {
    try {
      await logout.mutateAsync();
      await navigate({ to: v4Path("/login"), replace: true });
    } catch (error) {
      failed("Failed to log out", error);
    }
  };
  const items: ShellMenuEntry[] = [
    {
      label: "Personal settings",
      icon: "user",
      onSelect: () =>
        go(live ? v4Path("/personal-settings") : `${v4Path("/personal-settings")}?org=${orgId}`)
    },
    ...(canInvite
      ? [
          {
            label: "Invite users",
            icon: "user-plus" as const,
            onSelect: () => go(`${accessLinks.org(orgId)}&action=invite-members`)
          }
        ]
      : []),
    ...(user.superAdmin && !inServerConsole
      ? [
          {
            label: "Server console",
            icon: "settings" as const,
            onSelect: () => go(live ? v4Path("/admin") : `${v4Path("/admin")}?demo=true`)
          }
        ]
      : [])
  ];
  const { data: announcementData } = org.useAnnouncements();
  const markSeen = org.useMarkAnnouncementSeen();
  const { data: currentOrg } = org.useOrganization(orgId);
  const [announcementsOpen, setAnnouncementsOpen] = useState(false);
  const [serverAdminsOpen, setServerAdminsOpen] = useState(false);
  const version = useVersion();
  const announcementList = announcementData?.announcements ?? [];
  const latest = announcementList[0];
  const seenIndex = announcementList.findIndex(
    (item) => item.id === announcementData?.lastSeenAnnouncementId
  );
  const unread = seenIndex === -1 ? announcementList.length : seenIndex;
  const openAnnouncements = () => setAnnouncementsOpen(true);
  const onAnnouncementsOpenChange = (open: boolean) => {
    setAnnouncementsOpen(open);
    if (!open && latest && latest.id !== announcementData?.lastSeenAnnouncementId)
      markSeen.mutateAsync(latest.id).catch(() => undefined);
  };
  const account: TopBarAccount = {
    name: user.name,
    email: user.email,
    items,
    theme: { value: theme, onChange: setTheme },
    endItems: [
      { label: "Copy token", icon: "copy", onSelect: copyToken },
      { type: "separator" },
      { label: "Log out", icon: LogOut, onSelect: logOut }
    ]
  };
  const help: SidebarHelp = {
    status: { label: "Infisical status", href: "https://status.infisical.com" },
    whatsNew: latest && {
      unread,
      latest: publishedDate(latest.published, { month: "short", day: "numeric" }),
      onSelect: openAnnouncements
    },
    items: [
      {
        label: "Support Forum",
        icon: MessagesSquare,
        href: "https://community.infisical.com",
        external: true
      },
      {
        label: "Read Docs",
        icon: BookOpen,
        href: "https://infisical.com/docs/documentation/getting-started/introduction",
        external: true
      },
      {
        label: "GitHub Issues",
        icon: Github,
        href: "https://github.com/Infisical/infisical/issues",
        external: true
      },
      { label: "Email Support", icon: Mail, href: supportEmailHref(orgId, currentOrg?.rootOrgId) },
      ...(isInfisicalCloud()
        ? []
        : [{ label: "Server admins", icon: Users, onSelect: () => setServerAdminsOpen(true) }])
    ],
    version: version.label
  };
  return {
    account,
    help,
    versionBadge: version.badge,
    announcements: latest && { unread, onClick: openAnnouncements },
    dialog: (
      <>
        {latest && (
          <Announcements
            items={announcementList.map(toAnnouncement)}
            open={announcementsOpen}
            onOpenChange={onAnnouncementsOpenChange}
          />
        )}
        <ServerAdminsDialog
          orgId={orgId}
          open={serverAdminsOpen}
          onOpenChange={setServerAdminsOpen}
        />
      </>
    )
  };
};
