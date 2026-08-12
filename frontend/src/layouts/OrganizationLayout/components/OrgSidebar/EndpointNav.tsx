import { Activity, Laptop2, Route, Settings, Target } from "lucide-react";

import { ProjectNavList } from "./ProjectNavLink";
import type { NavItem, Submenu } from "./types";

export const EndpointNav = ({ onSubmenuOpen }: { onSubmenuOpen: (submenu: Submenu) => void }) => {
  const items: NavItem[] = [
    { label: "Devices", icon: Laptop2, pathSuffix: "devices" },
    { label: "Network Policy", icon: Route, pathSuffix: "network-policy" },
    { label: "Activity", icon: Activity, pathSuffix: "activity" },
    { label: "Targets", icon: Target, pathSuffix: "targets" },
    { label: "Settings", icon: Settings, pathSuffix: "settings" }
  ];

  return <ProjectNavList items={items} onSubmenuOpen={onSubmenuOpen} />;
};
