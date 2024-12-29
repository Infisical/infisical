import { createNotification } from "@app/components/notifications";
import { APP_CONNECTION_MAP } from "@app/helpers/appConnections";
import {
  TAppConnection,
  useCreateAppConnection,
  useUpdateAppConnection
} from "@app/hooks/api/appConnections";
import { AppConnection } from "@app/hooks/api/appConnections/enums";
import { DiscriminativePick } from "@app/types";

import { AppConnectionHeader } from "../AppConnectionHeader";
import { AwsConnectionForm } from "./AwsConnectionForm";
import { GitHubConnectionForm } from "./GitHubConnectionForm";

type FormProps = {
  onComplete: (appConnection: TAppConnection) => void;
} & ({ appConnection: TAppConnection } | { app: AppConnection });

type CreateFormProps = FormProps & { app: AppConnection };
type UpdateFormProps = FormProps & {
  appConnection: TAppConnection;
};

const CreateForm = ({ app, onComplete }: CreateFormProps) => {
  const createAppConnection = useCreateAppConnection();
  const { name: appName } = APP_CONNECTION_MAP[app];

  const onSubmit = async (
    formData: DiscriminativePick<TAppConnection, "method" | "name" | "app" | "credentials">
  ) => {
    try {
      const connection = await createAppConnection.mutateAsync(formData);
      createNotification({
        text: `Successfully added ${appName} Connection`,
        type: "success"
      });
      onComplete(connection);
    } catch (err: any) {
      console.error(err);
      createNotification({
        title: `Failed to add ${appName} Connection`,
        text: err.message,
        type: "error"
      });
    }
  };

  switch (app) {
    case AppConnection.AWS:
      return <AwsConnectionForm onSubmit={onSubmit} />;
    case AppConnection.GitHub:
      return <GitHubConnectionForm />;
    default:
      throw new Error(`Unhandled App ${app}`);
  }
};

const UpdateForm = ({ appConnection, onComplete }: UpdateFormProps) => {
  const updateAppConnection = useUpdateAppConnection();
  const { name: appName } = APP_CONNECTION_MAP[appConnection.app];

  const onSubmit = async (
    formData: DiscriminativePick<TAppConnection, "method" | "name" | "app" | "credentials">
  ) => {
    try {
      const connection = await updateAppConnection.mutateAsync({
        connectionId: appConnection.id,
        ...formData
      });
      createNotification({
        text: `Successfully updated ${appName} Connection`,
        type: "success"
      });
      onComplete(connection);
    } catch (err: any) {
      console.error(err);
      createNotification({
        title: `Failed to update ${appName} Connection`,
        text: err.message,
        type: "error"
      });
    }
  };

  switch (appConnection.app) {
    case AppConnection.AWS:
      return <AwsConnectionForm appConnection={appConnection} onSubmit={onSubmit} />;
    case AppConnection.GitHub:
      return <GitHubConnectionForm appConnection={appConnection} />;
    default:
      throw new Error(`Unhandled App ${(appConnection as TAppConnection).app}`);
  }
};

type Props = { onBack?: () => void } & Pick<FormProps, "onComplete"> &
  (
    | { app: AppConnection; appConnection?: undefined }
    | { app?: undefined; appConnection: TAppConnection }
  );
export const AppConnectionForm = ({ onBack, ...props }: Props) => {
  const { app, appConnection } = props;

  return (
    <div>
      <AppConnectionHeader
        isConnected={Boolean(appConnection)}
        app={appConnection?.app ?? app!}
        onBack={onBack}
      />
      {appConnection ? (
        <UpdateForm {...props} appConnection={appConnection} />
      ) : (
        <CreateForm {...props} app={app} />
      )}
    </div>
  );
};
