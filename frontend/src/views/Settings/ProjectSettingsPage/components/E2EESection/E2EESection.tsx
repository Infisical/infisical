import Link from "next/link";

import { UpgradeProjectAlert } from "@app/components/v2/UpgradeProjectAlert";
import { useWorkspace } from "@app/context";
import { useGetWorkspaceBot } from "@app/hooks/api";
import { ProjectVersion } from "@app/hooks/api/workspace/types";

export const E2EESection = () => {
  const { currentWorkspace } = useWorkspace();
  const { data: bot } = useGetWorkspaceBot(currentWorkspace?.id ?? "");

  if (!currentWorkspace) return null;

  return bot && currentWorkspace.version === ProjectVersion.V1 ? (
    <div className="mb-6 rounded-lg border border-mineshaft-600 bg-mineshaft-900 p-4">
      <div className="flex w-full items-center justify-between">
        <p className="text-xl font-semibold">End-to-End Encryption</p>
        <UpgradeProjectAlert transparent project={currentWorkspace} />
      </div>

      <p className="mt-5 max-w-2xl text-sm text-gray-400">
        We are updating our encryption logic to make sure that Infisical can be the most versatile
        secret management platform. <br />
        <br />
        Upgrading the project version is required to continue receiving the latest improvements and
        patches.
      </p>

      <Link href="https://infisical.com/docs/documentation/platform/project-upgrade">
        <a target="_blank" className="text-sm text-primary-400">
          Learn more about project upgrades
        </a>
      </Link>
    </div>
  ) : (
    <div />
  );
};
