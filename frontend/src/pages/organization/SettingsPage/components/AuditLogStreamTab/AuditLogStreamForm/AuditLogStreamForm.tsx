import { createNotification } from "@app/components/notifications";
import { AUDIT_LOG_STREAM_PROVIDER_MAP } from "@app/helpers/auditLogStreams";
import { useCreateAuditLogStream, useUpdateAuditLogStream } from "@app/hooks/api";
import { LogProvider } from "@app/hooks/api/auditLogStreams/enums";
import { TAuditLogStream } from "@app/hooks/api/types";
import { DiscriminativePick } from "@app/types";

import { AuditLogStreamHeader } from "../components/AuditLogStreamHeader";
import { AzureProviderAuditLogStreamForm } from "./AzureProviderAuditLogStreamForm";
import { CustomProviderAuditLogStreamForm } from "./CustomProviderAuditLogStreamForm";
import { DatadogProviderAuditLogStreamForm } from "./DatadogProviderAuditLogStreamForm";
import { SplunkProviderAuditLogStreamForm } from "./SplunkProviderAuditLogStreamForm";

type FormProps = {
  onComplete: (auditLogStream: TAuditLogStream) => void;
};

type CreateFormProps = FormProps & { provider: LogProvider };
type UpdateFormProps = FormProps & {
  auditLogStream: TAuditLogStream;
};

const CreateForm = ({ provider, onComplete }: CreateFormProps) => {
  const createAuditLogStream = useCreateAuditLogStream();
  const { name: providerName } = AUDIT_LOG_STREAM_PROVIDER_MAP[provider];

  const onSubmit = async (
    formData: DiscriminativePick<TAuditLogStream, "provider" | "credentials">
  ) => {
    try {
      const logStream = await createAuditLogStream.mutateAsync(formData);
      createNotification({
        text: `Successfully created ${providerName} Log Stream`,
        type: "success"
      });
      onComplete(logStream);
    } catch (err: any) {
      console.error(err);
      createNotification({
        title: `Failed to create ${providerName} Log Stream`,
        text: err.message,
        type: "error"
      });
    }
  };

  switch (provider) {
    case LogProvider.Azure:
      return <AzureProviderAuditLogStreamForm onSubmit={onSubmit} />;
    case LogProvider.Custom:
      return <CustomProviderAuditLogStreamForm onSubmit={onSubmit} />;
    case LogProvider.Datadog:
      return <DatadogProviderAuditLogStreamForm onSubmit={onSubmit} />;
    case LogProvider.Splunk:
      return <SplunkProviderAuditLogStreamForm onSubmit={onSubmit} />;
    default:
      throw new Error(`Unhandled Provider: ${provider}`);
  }
};

const UpdateForm = ({ auditLogStream, onComplete }: UpdateFormProps) => {
  const updateAuditLogStream = useUpdateAuditLogStream();
  const { name: providerName } = AUDIT_LOG_STREAM_PROVIDER_MAP[auditLogStream.provider];

  const onSubmit = async (
    formData: DiscriminativePick<TAuditLogStream, "provider" | "credentials">
  ) => {
    try {
      const connection = await updateAuditLogStream.mutateAsync({
        auditLogStreamId: auditLogStream.id,
        ...formData
      });
      createNotification({
        text: `Successfully updated ${providerName} Log Stream`,
        type: "success"
      });
      onComplete(connection);
    } catch (err: any) {
      console.error(err);
      createNotification({
        title: `Failed to update ${providerName} Log Stream`,
        text: err.message,
        type: "error"
      });
    }
  };

  switch (auditLogStream.provider) {
    case LogProvider.Azure:
      return (
        <AzureProviderAuditLogStreamForm onSubmit={onSubmit} auditLogStream={auditLogStream} />
      );
    case LogProvider.Custom:
      return (
        <CustomProviderAuditLogStreamForm onSubmit={onSubmit} auditLogStream={auditLogStream} />
      );
    case LogProvider.Datadog:
      return (
        <DatadogProviderAuditLogStreamForm onSubmit={onSubmit} auditLogStream={auditLogStream} />
      );
    case LogProvider.Splunk:
      return (
        <SplunkProviderAuditLogStreamForm onSubmit={onSubmit} auditLogStream={auditLogStream} />
      );
    default:
      throw new Error(`Unhandled Provider: ${(auditLogStream as TAuditLogStream).provider}`);
  }
};

type Props = { onBack?: () => void } & Pick<FormProps, "onComplete"> &
  (
    | { provider: LogProvider; auditLogStream?: undefined }
    | { provider?: undefined; auditLogStream: TAuditLogStream }
  );
export const AuditLogStreamForm = ({ onBack, ...props }: Props) => {
  const { provider, auditLogStream } = props;

  return (
    <div>
      <AuditLogStreamHeader
        logStreamExists={Boolean(auditLogStream)}
        provider={auditLogStream ? auditLogStream.provider : provider}
        onBack={onBack}
      />
      {auditLogStream ? (
        <UpdateForm {...props} auditLogStream={auditLogStream} />
      ) : (
        <CreateForm {...props} provider={provider} />
      )}
    </div>
  );
};
