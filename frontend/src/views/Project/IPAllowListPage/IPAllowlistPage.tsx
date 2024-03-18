import { ProjectPermissionActions, ProjectPermissionSub } from "@app/context";
import { withProjectPermission } from "@app/hoc";

import { IPAllowlistSection } from "./components";

export const IPAllowlistPage = withProjectPermission(
  () => {
    return (
      <div className="flex h-full w-full justify-center bg-bunker-800 text-white">
        <div className="w-full max-w-7xl px-6">
          <div className="my-6">
            <p className="text-3xl font-semibold text-gray-200">IP Allowlist</p>
            <div />
          </div>
          <IPAllowlistSection />
        </div>
      </div>
    );
  },
  { action: ProjectPermissionActions.Read, subject: ProjectPermissionSub.IpAllowList }
);
