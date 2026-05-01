import { FileText, Server, Settings, Shield, ShieldCheck } from "lucide-react";

import { ProjectPermissionCan } from "@app/components/permissions";
import { SidebarMenu } from "@app/components/v3";
import { ProjectPermissionActions, ProjectPermissionSub } from "@app/context";

import { ProjectNavLink } from "./ProjectNavLink";
import { PROJECT_ACCESS_CONTROL_SUBMENU } from "./submenus";
import type { NavItem, Submenu } from "./types";

export const SshNav = ({ onSubmenuOpen }: { onSubmenuOpen: (submenu: Submenu) => void }) => {
  const items: NavItem[] = [
    { label: "Hosts", icon: Server, pathSuffix: "overview", activeMatch: /\/ssh-host-groups\// },
    {
      label: "Certificate Authorities",
      icon: ShieldCheck,
      pathSuffix: "cas",
      activeMatch: /\/ca\//,
      permissionCheck: true
    },
    {
      label: "Access Control",
      icon: Shield,
      pathSuffix: "access-management",
      activeMatch: /\/groups\/|\/identities\/|\/members\/|\/roles\//,
      submenu: PROJECT_ACCESS_CONTROL_SUBMENU
    },
    { label: "Audit Logs", icon: FileText, pathSuffix: "audit-logs" },
    { label: "Settings", icon: Settings, pathSuffix: "settings" }
  ];

  return (
    <SidebarMenu>
      {items
        .filter((i) => !i.hidden)
        .map((item) => {
          if (item.permissionCheck) {
            return (
              <ProjectPermissionCan
                key={item.label}
                I={ProjectPermissionActions.Read}
                a={ProjectPermissionSub.SshCertificateAuthorities}
              >
                {(isAllowed) => (isAllowed ? <ProjectNavLink item={item} /> : null)}
              </ProjectPermissionCan>
            );
          }
          return (
            <ProjectNavLink
              key={item.label}
              item={item}
              onSubmenuOpen={item.submenu ? onSubmenuOpen : undefined}
            />
          );
        })}
    </SidebarMenu>
  );
};
