import { faCog, faTable, faUsers } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { Link } from "@tanstack/react-router";
import { AnimatePresence, motion } from "framer-motion";

import { Menu, MenuGroup, MenuItem } from "@app/components/v2";
import { useNamespace } from "@app/context";

export const NamespaceSidebar = () => {
  const { namespaceName } = useNamespace();

  return (
    <AnimatePresence mode="popLayout">
      <motion.aside
        key="namespace-sidebar"
        transition={{ duration: 0.3 }}
        initial={{ opacity: 0, translateX: -240 }}
        animate={{ opacity: 1, translateX: 0 }}
        exit={{ opacity: 0, translateX: -240 }}
        layout
        className="dark z-10 w-60 border-r border-mineshaft-600 bg-gradient-to-tr from-mineshaft-800 to-mineshaft-900"
      >
        <nav className="items-between flex h-full flex-col overflow-y-auto dark:[color-scheme:dark]">
          <Menu>
            <MenuGroup title="Namespace">
              <Link
                to="/organization/namespaces/$namespaceName/projects"
                params={{ namespaceName }}
              >
                {({ isActive }) => (
                  <MenuItem isSelected={isActive}>
                    <div className="mx-1 flex gap-2">
                      <div className="w-6">
                        <FontAwesomeIcon icon={faTable} />
                      </div>
                      Projects
                    </div>
                  </MenuItem>
                )}
              </Link>
              <Link
                to="/organization/namespaces/$namespaceName/access-management"
                params={{ namespaceName }}
              >
                {({ isActive }) => (
                  <MenuItem isSelected={isActive}>
                    <div className="mx-1 flex gap-2">
                      <div className="w-6">
                        <FontAwesomeIcon icon={faUsers} />
                      </div>
                      Access Control
                    </div>
                  </MenuItem>
                )}
              </Link>
              <Link to="/organization/settings">
                {({ isActive }) => (
                  <MenuItem isSelected={isActive}>
                    <div className="mx-1 flex gap-2">
                      <div className="w-6">
                        <FontAwesomeIcon icon={faCog} className="mr-4" />
                      </div>
                      Namespace Settings
                    </div>
                  </MenuItem>
                )}
              </Link>
            </MenuGroup>
          </Menu>
        </nav>
      </motion.aside>
    </AnimatePresence>
  );
};
