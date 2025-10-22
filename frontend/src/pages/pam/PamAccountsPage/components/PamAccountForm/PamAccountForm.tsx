import { createNotification } from "@app/components/notifications";
import {
  PamResourceType,
  TPamAccount,
  useCreatePamAccount,
  useUpdatePamAccount
} from "@app/hooks/api/pam";
import { DiscriminativePick } from "@app/types";

import { PamAccountHeader } from "../PamAccountHeader";
import { PostgresAccountForm } from "./PostgresAccountForm";

type FormProps = {
  onComplete: (account: TPamAccount) => void;
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
  onComplete,
  projectId,
  resourceId,
  resourceType,
  folderId
}: CreateFormProps) => {
  const createPamAccount = useCreatePamAccount();

  const onSubmit = async (
    formData: DiscriminativePick<
      TPamAccount,
      "name" | "description" | "credentials" | "rotationEnabled" | "rotationIntervalSeconds"
    >
  ) => {
    try {
      const account = await createPamAccount.mutateAsync({
        ...formData,
        folderId,
        resourceId,
        resourceType,
        projectId
      });
      createNotification({
        text: "Successfully created account",
        type: "success"
      });
      onComplete(account);
    } catch (err: any) {
      console.error(err);
      createNotification({
        title: "Failed to create account",
        text: err.message,
        type: "error"
      });
    }
  };

  switch (resourceType) {
    case PamResourceType.Postgres:
      return (
        <PostgresAccountForm
          onSubmit={onSubmit}
          resourceId={resourceId}
          resourceType={resourceType}
        />
      );
    default:
      throw new Error(`Unhandled resource: ${resourceType}`);
  }
};

const UpdateForm = ({ account, onComplete }: UpdateFormProps) => {
  const updatePamAccount = useUpdatePamAccount();

  const onSubmit = async (
    formData: DiscriminativePick<
      TPamAccount,
      "name" | "description" | "credentials" | "rotationEnabled" | "rotationIntervalSeconds"
    >
  ) => {
    try {
      const updatedAccount = await updatePamAccount.mutateAsync({
        accountId: account.id,
        resourceType: account.resource.resourceType,
        ...formData
      });
      createNotification({
        text: "Successfully updated account",
        type: "success"
      });
      onComplete(updatedAccount);
    } catch (err: any) {
      console.error(err);
      createNotification({
        title: "Failed to update account",
        text: err.message,
        type: "error"
      });
    }
  };

  switch (account.resource.resourceType) {
    case PamResourceType.Postgres:
      return <PostgresAccountForm account={account} onSubmit={onSubmit} />;
    default:
      throw new Error(`Unhandled resource: ${account.resource.resourceType}`);
  }
};

type Props = {
  onBack?: () => void;
  projectId: string;
} & FormProps &
  (
    | {
        account: TPamAccount;
        resourceId?: undefined;
        resourceName?: undefined;
        resourceType?: undefined;
        folderId?: undefined;
      }
    | {
        account?: undefined;
        resourceId: string;
        resourceName: string;
        resourceType: PamResourceType;
        folderId?: string;
      }
  );

export const PamAccountForm = ({ onBack, projectId, ...props }: Props) => {
  const { account, resourceName, resourceType } = props;

  return (
    <div>
      <PamAccountHeader
        resourceName={account ? account.resource.name : resourceName}
        resourceType={account ? account.resource.resourceType : resourceType}
        onBack={onBack}
      />
      {account ? (
        <UpdateForm {...props} account={account} />
      ) : (
        <CreateForm {...props} projectId={projectId} />
      )}
    </div>
  );
};
