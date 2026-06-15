import { KeyRound } from "lucide-react";

import { ProjectNavList } from "./ProjectNavLink";
import type { NavItem, Submenu } from "./types";

export const PamNav = ({ onSubmenuOpen }: { onSubmenuOpen: (submenu: Submenu) => void }) => {
  const items: NavItem[] = [{ label: "Access", icon: KeyRound, pathSuffix: "access" }];
  return <ProjectNavList items={items} onSubmenuOpen={onSubmenuOpen} />;
};
