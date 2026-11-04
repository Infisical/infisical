import { useState } from "react";
import { BookOpen, Github, LogOut, Mail, MessagesSquare } from "lucide-react";

import { useTheme } from "@app/components/v3/platform/ThemeProvider/ThemeProvider";
import { type Announcement, Announcements } from "@app/components/v4/ui/announcements";
import type { SidebarHelp } from "@app/components/v4/ui/sidebar";
import type { TopBarAccount } from "@app/components/v4/ui/top-bar";

import { useV4Session } from "../data/session/contract";
import { useClearThemeOverride } from "../useV4Theme";

const announcementItems: Announcement[] = [
  {
    id: "agent-vault",
    eyebrow: "October 30, 2026",
    title: "Agent Vault is in preview",
    description:
      "Give AI agents scoped access to the secrets and services they need, with every session recorded."
  },
  {
    id: "pam-recordings",
    eyebrow: "October 21, 2026",
    title: "Session recordings in PAM",
    description: "Replay brokered database and SSH sessions from the session detail page."
  }
];

export const useShellChrome = () => {
  const { user } = useV4Session();
  const { theme, setTheme } = useTheme();
  const clearThemeOverride = useClearThemeOverride();
  const [unseen, setUnseen] = useState(() => announcementItems.map((item) => item.id));
  const [announcementsOpen, setAnnouncementsOpen] = useState(false);
  const openAnnouncements = () => setAnnouncementsOpen(true);
  const account: TopBarAccount = {
    name: user.name,
    email: user.email,
    items: [
      { label: "Personal settings", icon: "user" },
      { label: "Invite users", icon: "user-plus" }
    ],
    theme: {
      value: theme,
      onChange: (value) => {
        setTheme(value, "profile-menu");
        clearThemeOverride();
      }
    },
    endItems: [
      { label: "Copy token", icon: "copy" },
      { type: "separator" },
      { label: "Log out", icon: LogOut }
    ]
  };
  const help: SidebarHelp = {
    status: { label: "All systems operational", href: "https://status.infisical.com" },
    whatsNew: { unread: unseen.length, latest: "Oct 30", onSelect: openAnnouncements },
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
      { label: "Email Support", icon: Mail, href: "mailto:support@infisical.com" }
    ]
  };
  return {
    account,
    help,
    announcements: { unread: unseen.length, onClick: openAnnouncements },
    dialog: (
      <Announcements
        items={announcementItems}
        open={announcementsOpen}
        onOpenChange={setAnnouncementsOpen}
        onSeen={(id) => setUnseen((ids) => ids.filter((entry) => entry !== id))}
      />
    )
  };
};
