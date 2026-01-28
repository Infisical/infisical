import { ReactNode } from "react";
import { faRotate } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { format } from "date-fns";

import { ViewAuth0ClientSecretRotationGeneratedCredentials } from "@app/components/secret-rotations-v2/ViewSecretRotationV2GeneratedCredentials/ViewAuth0ClientSecretRotationGeneratedCredentials";
import { ViewAzureClientSecretRotationGeneratedCredentials } from "@app/components/secret-rotations-v2/ViewSecretRotationV2GeneratedCredentials/ViewAzureClientSecretRotationGeneratedCredentials";
import { ViewDatabricksServicePrincipalSecretRotationGeneratedCredentials } from "@app/components/secret-rotations-v2/ViewSecretRotationV2GeneratedCredentials/ViewDatabricksServicePrincipalSecretRotationGeneratedCredentials";
import { ViewLdapPasswordRotationGeneratedCredentials } from "@app/components/secret-rotations-v2/ViewSecretRotationV2GeneratedCredentials/ViewLdapPasswordRotationGeneratedCredentials";
import { Modal, ModalContent, Spinner } from "@app/components/v2";
import { NoticeBannerV2 } from "@app/components/v2/NoticeBannerV2/NoticeBannerV2";
import { APP_CONNECTION_MAP } from "@app/helpers/appConnections";
import {
  IS_ROTATION_DUAL_CREDENTIALS,
  SECRET_ROTATION_CONNECTION_MAP,
  SECRET_ROTATION_MAP
} from "@app/helpers/secretRotationsV2";
import {
  SecretRotation,
  TSecretRotationV2,
  useViewSecretRotationV2GeneratedCredentials
} from "@app/hooks/api/secretRotationsV2";

import { ViewSqlCredentialsRotationGeneratedCredentials } from "./shared";
import { ViewAwsIamUserSecretRotationGeneratedCredentials } from "./ViewAwsIamUserSecretRotationGeneratedCredentials";
import { ViewDbtServiceTokenRotationGeneratedCredentials } from "./ViewDbtSeviceTokenRotationGeneratedCredentials";
import { ViewOktaClientSecretRotationGeneratedCredentials } from "./ViewOktaClientSecretRotationGeneratedCredentials";
import { ViewRedisCredentialsRotationGeneratedCredentials } from "./ViewRedisCredentialsRotationGeneratedCredentials";
import { ViewUnixLinuxLocalAccountRotationGeneratedCredentials } from "./ViewUnixLinuxLocalAccountRotationGeneratedCredentials";

type Props = {
  secretRotation?: TSecretRotationV2;
  isOpen: boolean;
  onOpenChange: (isOpen: boolean) => void;
};

type ContentProps = {
  secretRotation: TSecretRotationV2;
};

const Content = ({ secretRotation }: ContentProps) => {
  const { id: rotationId, type, nextRotationAt } = secretRotation;

  const { data: generatedCredentialsResponse, isPending } =
    useViewSecretRotationV2GeneratedCredentials({
      rotationId,
      type
    });

  if (isPending) {
    return (
      <div className="flex h-full flex-col items-center justify-center py-2.5">
        <Spinner size="lg" className="text-mineshaft-500" />
        <p className="mt-4 text-sm text-mineshaft-400">Loading generated credentials...</p>
      </div>
    );
  }

  if (!generatedCredentialsResponse) {
    return (
      <div className="flex w-full justify-center">
        <p className="text-sm text-red">No generated credentials found for this rotation.</p>
      </div>
    );
  }

  let Component: ReactNode;
  switch (generatedCredentialsResponse.type) {
    case SecretRotation.PostgresCredentials:
    case SecretRotation.MySqlCredentials:
    case SecretRotation.MsSqlCredentials:
    case SecretRotation.OracleDBCredentials:
    case SecretRotation.MongoDBCredentials:
      Component = (
        <ViewSqlCredentialsRotationGeneratedCredentials
          generatedCredentialsResponse={generatedCredentialsResponse}
        />
      );
      break;
    case SecretRotation.Auth0ClientSecret:
      Component = (
        <ViewAuth0ClientSecretRotationGeneratedCredentials
          generatedCredentialsResponse={generatedCredentialsResponse}
        />
      );
      break;
    case SecretRotation.AzureClientSecret:
      Component = (
        <ViewAzureClientSecretRotationGeneratedCredentials
          generatedCredentialsResponse={generatedCredentialsResponse}
        />
      );
      break;
    case SecretRotation.LdapPassword:
      Component = (
        <ViewLdapPasswordRotationGeneratedCredentials
          generatedCredentialsResponse={generatedCredentialsResponse}
        />
      );
      break;
    case SecretRotation.AwsIamUserSecret:
      Component = (
        <ViewAwsIamUserSecretRotationGeneratedCredentials
          generatedCredentialsResponse={generatedCredentialsResponse}
        />
      );
      break;
    case SecretRotation.OktaClientSecret:
      Component = (
        <ViewOktaClientSecretRotationGeneratedCredentials
          generatedCredentialsResponse={generatedCredentialsResponse}
        />
      );
      break;
    case SecretRotation.RedisCredentials:
      Component = (
        <ViewRedisCredentialsRotationGeneratedCredentials
          generatedCredentialsResponse={generatedCredentialsResponse}
        />
      );
      break;
    case SecretRotation.DatabricksServicePrincipalSecret:
      Component = (
        <ViewDatabricksServicePrincipalSecretRotationGeneratedCredentials
          generatedCredentialsResponse={generatedCredentialsResponse}
        />
      );
      break;
    case SecretRotation.UnixLinuxLocalAccount:
      Component = (
        <ViewUnixLinuxLocalAccountRotationGeneratedCredentials
          generatedCredentialsResponse={generatedCredentialsResponse}
        />
      );
      break;
    case SecretRotation.DbtServiceToken:
      Component = (
        <ViewDbtServiceTokenRotationGeneratedCredentials
          generatedCredentialsResponse={generatedCredentialsResponse}
        />
      );
      break;
    default:
      throw new Error("Unhandled View Generated Credential Rotation Type");
  }

  const appName = APP_CONNECTION_MAP[SECRET_ROTATION_CONNECTION_MAP[type]].name;

  return (
    <div className="flex flex-col gap-y-4">
      {Component}
      {!IS_ROTATION_DUAL_CREDENTIALS[type] && (
        <NoticeBannerV2 title={`${appName} Retired Credentials Behavior`}>
          <p className="text-sm text-mineshaft-300">
            Due to {SECRET_ROTATION_MAP[type].name} Rotations utilizing a single credential set,
            retired credentials will not be able to authenticate with {appName} during their{" "}
            <a
              target="_blank"
              href="https://infisical.com/docs/documentation/platform/secret-rotation/overview#how-rotation-works"
              rel="noopener noreferrer"
              className="underline decoration-primary underline-offset-2 hover:text-mineshaft-200"
            >
              inactive period
            </a>
            . This is a limitation of {appName} and cannot be rectified by Infisical.
          </p>
        </NoticeBannerV2>
      )}
      {nextRotationAt && (
        <div className="flex items-center gap-x-1.5 text-sm text-mineshaft-200">
          <FontAwesomeIcon icon={faRotate} className="text-mineshaft-400" />
          <span>
            Next rotation occurs on: {format(nextRotationAt, "MM/dd/yyyy")} at{" "}
            {format(nextRotationAt, "h:mm aa")}{" "}
            <span className="text-mineshaft-300">(Local Time)</span>
          </span>
        </div>
      )}
    </div>
  );
};

export const ViewSecretRotationV2GeneratedCredentialsModal = ({
  isOpen,
  onOpenChange,
  secretRotation
}: Props) => {
  if (!secretRotation) return null;

  const rotationType = SECRET_ROTATION_MAP[secretRotation.type].name;

  return (
    <Modal isOpen={isOpen} onOpenChange={onOpenChange}>
      <ModalContent
        onOpenAutoFocus={(event) => {
          event.preventDefault();
        }}
        title="Generated Credentials"
        subTitle={`View the current and retired ${rotationType}.`}
      >
        <Content secretRotation={secretRotation} />
      </ModalContent>
    </Modal>
  );
};
