import { Link } from "@tanstack/react-router";

import { Modal, ModalContent } from "@app/components/v2";
import { useOrganization } from "@app/context";
import {
  getInPlatformMigrationProviderMeta,
  IN_PLATFORM_MIGRATION_APP_CONNECTIONS,
  IN_PLATFORM_MIGRATION_PROVIDER_DETAILS,
  TInPlatformMigrationApp
} from "@app/helpers/externalMigrationInPlatform";

type Props = {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  onSelect: (app: TInPlatformMigrationApp) => void;
};

export const SelectInPlatformMigrationProviderModal = ({
  isOpen,
  onOpenChange,
  onSelect
}: Props) => {
  const { currentOrg } = useOrganization();

  return (
    <Modal isOpen={isOpen} onOpenChange={onOpenChange}>
      <ModalContent title="Add migration configuration" className="max-w-lg">
        <p className="mb-4 text-sm text-mineshaft-300">
          Select a platform to link to in-platform migration. Credentials are managed in{" "}
          <Link
            to="/organizations/$orgId/app-connections"
            params={{ orgId: currentOrg.id }}
            className="text-primary underline hover:text-primary-300"
            onClick={() => onOpenChange(false)}
          >
            App Connections
          </Link>
          .
        </p>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          {IN_PLATFORM_MIGRATION_APP_CONNECTIONS.map((app) => {
            const { name, imageFileName, size } = getInPlatformMigrationProviderMeta(app);
            const { description } = IN_PLATFORM_MIGRATION_PROVIDER_DETAILS[app];

            return (
              <button
                key={app}
                type="button"
                onClick={() => {
                  onSelect(app);
                  onOpenChange(false);
                }}
                className="group flex flex-col items-center rounded-md border border-mineshaft-600 bg-mineshaft-700 p-4 text-left duration-200 hover:bg-mineshaft-600"
              >
                <img
                  src={`/images/integrations/${imageFileName}`}
                  style={{ width: `${size}px` }}
                  className="mt-1"
                  alt=""
                />
                <span className="mt-3 text-center text-sm font-medium text-gray-200 group-hover:text-white">
                  {name}
                </span>
                <span className="mt-2 text-center text-xs leading-snug text-mineshaft-400">
                  {description}
                </span>
              </button>
            );
          })}
        </div>
      </ModalContent>
    </Modal>
  );
};
