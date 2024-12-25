import { ProjectPermissionActions, ProjectPermissionSub } from "@app/context";
import { withProjectPermission } from "@app/hoc";

import { SshCertificatesSection } from "./components";

export const SshCertificatesPage = withProjectPermission(
  () => {
    return (
      <div className="container mx-auto flex flex-col justify-between bg-bunker-800 text-white">
        <div className="mx-auto mb-6 w-full max-w-7xl py-6 px-6">
          <p className="mr-4 mb-4 text-3xl font-semibold text-white">SSH Certificates</p>
            <SshCertificatesSection />
        </div>
      </div>
    );
  },
  { action: ProjectPermissionActions.Read, subject: ProjectPermissionSub.SshCertificates }
);
