import { Link } from "@tanstack/react-router";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle
} from "@app/components/v3";
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
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg overflow-visible" showCloseButton>
        <DialogHeader>
          <DialogTitle>Add migration configuration</DialogTitle>
          <DialogDescription asChild>
            <p>
              Select a platform to link to in-platform migration. Credentials are managed in{" "}
              <Link
                to="/organizations/$orgId/app-connections"
                params={{ orgId: currentOrg.id }}
                className="text-accent underline hover:no-underline"
                onClick={() => onOpenChange(false)}
              >
                App Connections
              </Link>
              .
            </p>
          </DialogDescription>
        </DialogHeader>
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
                className="group flex flex-col items-center rounded-md border border-border bg-container p-4 text-left duration-200 hover:bg-foreground/5"
              >
                <div className="flex h-12 items-center justify-center">
                  <img
                    src={`/images/integrations/${imageFileName}`}
                    style={{ width: size, height: size }}
                    className="object-contain"
                    alt=""
                  />
                </div>
                <span className="mt-3 text-center text-sm font-medium text-foreground group-hover:text-foreground">
                  {name}
                </span>
                <span className="mt-2 flex-1 text-center text-xs leading-snug text-muted">
                  {description}
                </span>
              </button>
            );
          })}
        </div>
      </DialogContent>
    </Dialog>
  );
};
