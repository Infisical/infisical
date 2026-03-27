import { createNotification } from "@app/components/notifications";
import {
  PamResourceType,
  TPamAccount,
  useCreatePamAccount,
  useUpdatePamAccount
} from "@app/hooks/api/pam";
import { DiscriminativePick } from "@app/types";

import { ActiveDirectoryAccountForm } from "./ActiveDirectoryAccountForm";
import { AwsIamAccountForm } from "./AwsIamAccountForm";
import { KubernetesAccountForm } from "./KubernetesAccountForm";
import { MongoDBAccountForm } from "./MongoDBAccountForm";
import { MsSQLAccountForm } from "./MsSQLAccountForm";
import { MySQLAccountForm } from "./MySQLAccountForm";
import { PostgresAccountForm } from "./PostgresAccountForm";
import { RedisAccountForm } from "./RedisAccountForm";
import { SshAccountForm } from "./SshAccountForm";
import { WindowsAccountForm } from "./WindowsAccountForm";

type FormProps = {
  closeSheet: (account?: TPamAccount) => void;
};

type CreateFormProps = FormProps & {
  projectId: string;
  resourceId: string;
  resourceType: PamResourceType;
  folderId?: string;
};

type UpdateFormProps = FormProps & {
  account: TPamAccount;
};

const CreateForm = ({
  closeSheet,
  projectId,
  resourceId,
  resourceType,
  folderId
}: CreateFormProps) => {
  const createPamAccount = useCreatePamAccount();

  const onSubmit = async (
    formData: DiscriminativePick<
      TPamAccount,
      "name" | "description" | "credentials" | "requireMfa"
    > & {
      internalMetadata?: Record<string, unknown>;
      metadata?: { key: string; value: string }[];
    }
  ) => {
    const { internalMetadata, ...rest } = formData;
    const account = await createPamAccount.mutateAsync({
      ...rest,
      folderId,
      resourceId,
      resourceType,
      projectId,
      internalMetadata
    });
    createNotification({
      text: "Successfully created account",
      type: "success"
    });
    closeSheet(account);
  };

  switch (resourceType) {
    case PamResourceType.Postgres:
      return (
        <PostgresAccountForm
          onSubmit={onSubmit}
          closeSheet={closeSheet}
          resourceId={resourceId}
          resourceType={resourceType}
        />
      );
    case PamResourceType.MySQL:
      return (
        <MySQLAccountForm
          onSubmit={onSubmit}
          closeSheet={closeSheet}
          resourceId={resourceId}
          resourceType={resourceType}
        />
      );
    case PamResourceType.MsSQL:
      return (
        <MsSQLAccountForm
          onSubmit={onSubmit}
          closeSheet={closeSheet}
          resourceId={resourceId}
          resourceType={resourceType}
        />
      );
    case PamResourceType.MongoDB:
      return (
        <MongoDBAccountForm
          onSubmit={onSubmit}
          resourceId={resourceId}
          resourceType={resourceType}
        />
      );
    case PamResourceType.Redis:
      return (
        <RedisAccountForm
          onSubmit={onSubmit as Parameters<typeof RedisAccountForm>[0]["onSubmit"]}
          closeSheet={closeSheet}
          resourceId={resourceId}
          resourceType={resourceType}
        />
      );
    case PamResourceType.SSH:
      return (
        <SshAccountForm
          onSubmit={onSubmit}
          closeSheet={closeSheet}
          resourceId={resourceId}
          resourceType={resourceType}
        />
      );
    case PamResourceType.Kubernetes:
      return (
        <KubernetesAccountForm
          onSubmit={onSubmit}
          closeSheet={closeSheet}
          resourceId={resourceId}
          resourceType={resourceType}
        />
      );
    case PamResourceType.AwsIam:
      return (
        <AwsIamAccountForm
          onSubmit={onSubmit}
          closeSheet={closeSheet}
          resourceId={resourceId}
          resourceType={resourceType}
        />
      );
    case PamResourceType.Windows:
      return (
        <WindowsAccountForm
          onSubmit={onSubmit}
          closeSheet={closeSheet}
          resourceId={resourceId}
          resourceType={resourceType}
        />
      );
    case PamResourceType.ActiveDirectory:
      return (
        <ActiveDirectoryAccountForm
          onSubmit={onSubmit}
          closeSheet={closeSheet}
          resourceId={resourceId}
          resourceType={resourceType}
        />
      );
    default:
      throw new Error(`Unhandled resource: ${resourceType}`);
  }
};

const UpdateForm = ({ account, closeSheet }: UpdateFormProps) => {
  const updatePamAccount = useUpdatePamAccount();

  const onSubmit = async (
    formData: DiscriminativePick<
      TPamAccount,
      "name" | "description" | "credentials" | "requireMfa"
    > & {
      internalMetadata?: Record<string, unknown>;
      metadata?: { key: string; value: string }[];
    }
  ) => {
    const { internalMetadata, ...rest } = formData;
    const updatedAccount = await updatePamAccount.mutateAsync({
      accountId: account.id,
      resourceType: account.resource.resourceType,
      ...rest,
      internalMetadata
    });
    createNotification({
      text: "Successfully updated account",
      type: "success"
    });
    closeSheet(updatedAccount);
  };

  switch (account.resource.resourceType) {
    case PamResourceType.Postgres:
      return (
        <PostgresAccountForm account={account as any} onSubmit={onSubmit} closeSheet={closeSheet} />
      );
    case PamResourceType.MySQL:
      return (
        <MySQLAccountForm account={account as any} onSubmit={onSubmit} closeSheet={closeSheet} />
      );
    case PamResourceType.MsSQL:
      return (
        <MsSQLAccountForm account={account as any} onSubmit={onSubmit} closeSheet={closeSheet} />
      );
    case PamResourceType.MongoDB:
      return <MongoDBAccountForm account={account as any} onSubmit={onSubmit} closeSheet={closeSheet} />;
    case PamResourceType.Redis:
      return (
        <RedisAccountForm
          account={account as any}
          onSubmit={onSubmit as Parameters<typeof RedisAccountForm>[0]["onSubmit"]}
          closeSheet={closeSheet}
        />
      );
    case PamResourceType.SSH:
      return (
        <SshAccountForm account={account as any} onSubmit={onSubmit} closeSheet={closeSheet} />
      );
    case PamResourceType.Kubernetes:
      return (
        <KubernetesAccountForm
          account={account as any}
          onSubmit={onSubmit}
          closeSheet={closeSheet}
        />
      );
    case PamResourceType.AwsIam:
      return (
        <AwsIamAccountForm account={account as any} onSubmit={onSubmit} closeSheet={closeSheet} />
      );
    case PamResourceType.Windows:
      return (
        <WindowsAccountForm account={account as any} onSubmit={onSubmit} closeSheet={closeSheet} />
      );
    case PamResourceType.ActiveDirectory:
      return (
        <ActiveDirectoryAccountForm
          account={account as any}
          onSubmit={onSubmit}
          closeSheet={closeSheet}
        />
      );
    default:
      throw new Error(`Unhandled resource: ${account.resource.resourceType}`);
  }
};

type Props = {
  projectId: string;
} & FormProps &
  (
    | {
        account: TPamAccount;
        resourceId?: undefined;
        resourceType?: undefined;
        folderId?: undefined;
      }
    | {
        account?: undefined;
        resourceId: string;
        resourceType: PamResourceType;
        folderId?: string;
      }
  );

export const PamAccountForm = ({ projectId, ...props }: Props) => {
  const { account } = props;

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
      {account ? (
        <UpdateForm {...props} account={account} />
      ) : (
        <CreateForm {...props} projectId={projectId} />
      )}
    </div>
  );
};
