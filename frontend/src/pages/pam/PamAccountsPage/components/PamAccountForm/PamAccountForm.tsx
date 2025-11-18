import { useNavigate } from "@tanstack/react-router";

import { createNotification } from "@app/components/notifications";
import {
  PamResourceType,
  TMcpAccount,
  TMySQLAccount,
  TPamAccount,
  TPostgresAccount,
  useCreatePamAccount,
  useUpdatePamAccount
} from "@app/hooks/api/pam";
import { DiscriminativePick } from "@app/types";

import { PamAccountHeader } from "../PamAccountHeader";
import { McpAccountForm } from "./McpAccountForm";
import { MySQLAccountForm } from "./MySQLAccountForm";
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
  const navigate = useNavigate();

  const onSubmit = async (
    formData: DiscriminativePick<TPamAccount, "name" | "description" | "credentials">
  ) => {
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
    if (resourceType === PamResourceType.MCP) {
      if (
        "headers" in formData.credentials &&
        formData.credentials.headers?.find((el) => el.key === "Authorization")
      ) {
        onComplete(account);
        return;
      }

      navigate({
        to: "/projects/pam/$projectId/mcp-server-oauth/$accountId/authorize",
        params: {
          projectId,
          accountId: account.id
        }
      });
    } else {
      onComplete(account);
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
    case PamResourceType.MySQL:
      return (
        <MySQLAccountForm onSubmit={onSubmit} resourceId={resourceId} resourceType={resourceType} />
      );
    case PamResourceType.MCP:
      return (
        <McpAccountForm onSubmit={onSubmit} resourceId={resourceId} resourceType={resourceType} />
      );
    default:
      throw new Error(`Unhandled resource: ${resourceType}`);
  }
};

const UpdateForm = ({ account, onComplete }: UpdateFormProps) => {
  const updatePamAccount = useUpdatePamAccount();
  const navigate = useNavigate();

  const onSubmit = async (
    formData: DiscriminativePick<TPamAccount, "name" | "description" | "credentials">
  ) => {
    const updatedAccount = await updatePamAccount.mutateAsync({
      accountId: account.id,
      resourceType: account.resource.resourceType,
      ...formData
    });

    if (account.resource.resourceType === PamResourceType.MCP) {
      if (
        "headers" in formData.credentials &&
        formData.credentials.headers?.find((el) => el.key === "Authorization")
      ) {
        onComplete(account);
        return;
      }

      navigate({
        to: "/projects/pam/$projectId/mcp-server-oauth/$accountId/authorize",
        params: {
          projectId: account.projectId,
          accountId: account.id
        }
      });
    } else {
      onComplete(account);
    }
    createNotification({
      text: "Successfully updated account",
      type: "success"
    });
    onComplete(updatedAccount);
  };

  switch (account.resource.resourceType) {
    case PamResourceType.Postgres:
      return <PostgresAccountForm account={account as TPostgresAccount} onSubmit={onSubmit} />;
    case PamResourceType.MySQL:
      return <MySQLAccountForm account={account as TMySQLAccount} onSubmit={onSubmit} />;
    case PamResourceType.MCP:
      return <McpAccountForm account={account as TMcpAccount} onSubmit={onSubmit} />;
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
