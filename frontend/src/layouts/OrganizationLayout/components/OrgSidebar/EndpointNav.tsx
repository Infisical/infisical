import { Activity, Laptop2, Route, Target } from "lucide-react";

import { ProjectNavList } from "./ProjectNavLink";
import type { NavItem, Submenu } from "./types";

export const EndpointNav = ({ onSubmenuOpen }: { onSubmenuOpen: (submenu: Submenu) => void }) => {
  const items: NavItem[] = [
    { label: "Devices", icon: Laptop2, pathSuffix: "devices" },
    { label: "Egress Policy", icon: Route, pathSuffix: "egress-policy" },
    { label: "Activity", icon: Activity, pathSuffix: "activity" },
    { label: "Targets", icon: Target, pathSuffix: "targets" }
  ];

  return <ProjectNavList items={items} onSubmenuOpen={onSubmenuOpen} />;
};
