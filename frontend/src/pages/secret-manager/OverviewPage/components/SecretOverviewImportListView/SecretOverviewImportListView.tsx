import { faCheck, faFileImport, faXmark } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { twMerge } from "tailwind-merge";

import { Td, Tr } from "@app/components/v2";
import { TSecretImport, WorkspaceEnv } from "@app/hooks/api/types";
import { EnvFolderIcon } from "@app/pages/secret-manager/SecretDashboardPage/components/SecretImportListView/SecretImportItem";

type Props = {
  secretImport: { importPath: string; importEnv: WorkspaceEnv };
  environments: { name: string; slug: string }[];
  allSecretImports?: TSecretImport[];
};

export const SecretOverviewImportListView = ({
  secretImport,
  environments = [],
  allSecretImports = []
}: Props) => {
  const isSecretPresentInEnv = (envSlug: string) => {
    return allSecretImports.some((item) => {
      if (item.isReplication) {
        const reservedItem = allSecretImports.find((element) =>
          element.importPath.includes(`__reserve_replication_${item.id}`)
        );
        // If the reserved item exists, check if the envSlug matches
        if (reservedItem) {
          return reservedItem.environment === envSlug;
        }
      } else {
        // If the item is not replication, check if the envSlug matches directly
        return item.environment === envSlug;
      }
      return false;
    });
  };

  return (
    <Tr className="group">
      <Td className="sticky left-0 z-10 bg-mineshaft-800 bg-clip-padding px-0 py-0 group-hover:bg-mineshaft-700">
        <div className="group flex cursor-pointer">
          <div className="flex w-11 items-center py-2 pl-5 text-green-700">
            <FontAwesomeIcon icon={faFileImport} />
          </div>
          <div className="flex flex-grow items-center py-2 pl-4 pr-2">
            <EnvFolderIcon
              env={secretImport.importEnv.slug || ""}
              secretPath={secretImport.importPath || ""}
            />
          </div>
        </div>
      </Td>
      {environments.map(({ slug }, i) => {
        const isPresent = isSecretPresentInEnv(slug);
        return (
          <Td
            key={`sec-overview-${slug}-${i + 1}-value`}
            className={twMerge(
              "px-0 py-0 group-hover:bg-mineshaft-700",
              isPresent ? "text-green-600" : "text-red-600"
            )}
          >
            <div className="h-full w-full border-r border-mineshaft-600 px-5 py-[0.85rem]">
              <div className="flex justify-center">
                <FontAwesomeIcon
                  // eslint-disable-next-line no-nested-ternary
                  icon={isSecretPresentInEnv(slug) ? faCheck : faXmark}
                />
              </div>
            </div>
          </Td>
        );
      })}
    </Tr>
  );
};
