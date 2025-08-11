import { Modal, ModalContent } from "@app/components/v2";
import { APP_CONNECTION_MAP } from "@app/helpers/appConnections";
import { TAppConnection } from "@app/hooks/api/appConnections";
import { ProjectType } from "@app/hooks/api/workspace/types";

import { AppConnectionForm } from "./AppConnectionForm";

type Props = {
  isOpen: boolean;
  onOpenChange: (isOpen: boolean) => void;
  appConnection?: TAppConnection;
  projectType?: ProjectType;
};

export const EditAppConnectionCredentialsModal = ({
  isOpen,
  onOpenChange,
  appConnection,
  projectType
}: Props) => {
  if (!appConnection) return null;

  return (
    <Modal isOpen={isOpen} onOpenChange={onOpenChange}>
      <ModalContent
        className="max-w-2xl"
        title="Edit Connection Credentials"
        subTitle={`Update the credentials for this ${
          appConnection ? APP_CONNECTION_MAP[appConnection.app].name : "App"
        } Connection.`}
      >
        <AppConnectionForm
          onComplete={() => onOpenChange(false)}
          appConnection={appConnection}
          projectType={projectType}
        />
      </ModalContent>
    </Modal>
  );
};
