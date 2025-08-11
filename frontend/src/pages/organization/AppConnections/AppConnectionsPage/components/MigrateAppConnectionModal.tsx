import { faUpload, faWarning } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";

import { createNotification } from "@app/components/notifications";
import { Button, EmptyState, Lottie, Modal, ModalClose, ModalContent } from "@app/components/v2";
import { APP_CONNECTION_MAP } from "@app/helpers/appConnections";
import { getProjectLottieIcon, getProjectTitle } from "@app/helpers/project";
import {
  TAppConnection,
  useGetAppConnectionUsageById,
  useMigrateAppConnection
} from "@app/hooks/api/appConnections";

type Props = {
  isOpen: boolean;
  onOpenChange: (isOpen: boolean) => void;
  appConnection?: TAppConnection;
};

type ContentProps = {
  appConnection: TAppConnection;
  onComplete: () => void;
};

const ResourceNameMap: Record<string, string> = {
  secretSyncs: "Secret Syncs",
  secretRotations: "Secret Rotations",
  externalCas: "External Certificate Authorities",
  dataSources: "Data Sources"
};

const Content = ({ appConnection: { app, id: connectionId }, onComplete }: ContentProps) => {
  const { data, isPending } = useGetAppConnectionUsageById(app, connectionId);

  const migrate = useMigrateAppConnection();

  const handleMigrate = async () => {
    try {
      await migrate.mutateAsync({ app, connectionId });

      createNotification({
        title: "App Connection migrated successfully",
        text: "You can safely remove this app connection.",
        type: "success"
      });
      onComplete();
    } catch {
      createNotification({
        text: "Failed to migrate App Connection",
        type: "error"
      });
    }
  };

  if (isPending) {
    return (
      <div className="flex w-full items-center justify-center py-3">
        <Lottie isAutoPlay icon="infisical_loading" className="h-16 w-16" />
      </div>
    );
  }

  if (!data) {
    return <EmptyState title="Failed to load App Connection usage." icon={faWarning} />;
  }

  const { projects } = data;

  if (!projects.length) {
    return <EmptyState title="This App Connection is not used in any projects." />;
  }

  return (
    <>
      <div className="mb-4 flex w-full items-start rounded-md border border-yellow/50 bg-yellow/30 px-4 py-2 text-sm text-yellow-200">
        <FontAwesomeIcon icon={faWarning} className="mr-2.5 mt-1 text-base text-yellow" />
        <p>
          By migrating this App Connection you are transferring responsibility and management of the
          connection to the respective projects.
          <p className="pt-1">
            A new project-level app connection will be created for each project with the same
            configuration. All resources using this connection will be updated to use the new
            project-level connection.
          </p>
        </p>
      </div>
      <div className="border-b border-mineshaft-500 pb-1 text-sm text-mineshaft-300">
        The following projects will be affected:
      </div>
      <div className="flex max-h-[40vh] flex-col gap-y-4 overflow-y-auto border-mineshaft-400 py-3 [&::-webkit-scrollbar]:border-y">
        {projects.map(({ id, name, type, resources }) => {
          return (
            <div key={id} className="rounded-md border border-mineshaft-500 bg-mineshaft-900/50">
              <div className="flex w-full items-center gap-2 border-b border-b-mineshaft-500 bg-mineshaft-700 px-4 py-2">
                <div className="w-min rounded border border-mineshaft-500 bg-mineshaft-700 p-1 shadow-inner">
                  <Lottie icon={getProjectLottieIcon(type)} className="h-4 w-4" />
                </div>
                <span>{name}</span>
                <span className="ml-auto text-sm text-mineshaft-400">{getProjectTitle(type)}</span>
              </div>
              <div className="flex flex-col gap-y-2 px-4 py-3">
                {Object.entries(resources).map(([key, resourceGroup]) => {
                  if (!resourceGroup.length) return null;

                  return (
                    <div key={key + id}>
                      <span className="text-sm text-mineshaft-400">{ResourceNameMap[key]}</span>
                      <ul className="ml-4 list-disc text-sm">
                        {resourceGroup.map((resource) => (
                          <li key={resource.id} className="">
                            {resource.name}
                          </li>
                        ))}
                      </ul>
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
      <div className="flex items-center gap-2 pt-4">
        <Button
          onClick={handleMigrate}
          leftIcon={<FontAwesomeIcon icon={faUpload} />}
          variant="outline_bg"
          isLoading={migrate.isPending}
          isDisabled={migrate.isPending}
        >
          Migrate App Connection
        </Button>
        <ModalClose asChild>
          <Button variant="plain" colorSchema="secondary">
            Cancel
          </Button>
        </ModalClose>
      </div>
    </>
  );
};

export const MigrateAppConnectionModal = ({ isOpen, onOpenChange, appConnection }: Props) => {
  if (!appConnection) return null;

  return (
    <Modal isOpen={isOpen} onOpenChange={onOpenChange}>
      <ModalContent
        className="max-w-2xl"
        title="Migrate App Connection"
        subTitle={`Migrate this organization-level ${
          appConnection ? APP_CONNECTION_MAP[appConnection.app].name : "App"
        } Connection to projects using it.`}
      >
        <Content appConnection={appConnection} onComplete={() => onOpenChange(false)} />
      </ModalContent>
    </Modal>
  );
};
