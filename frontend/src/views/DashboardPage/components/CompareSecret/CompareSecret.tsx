import { useCallback } from 'react';

import { FormControl, Input, Spinner } from '@app/components/v2';
import { useGetProjectSecrets, useGetUserWsKey } from '@app/hooks/api';

type SecretValueProps = {
  workspaceId: string;
  envName: string;
  env: string;
  secretKey: string;
};

const SecretValue = ({ workspaceId, env, envName, secretKey }: SecretValueProps) => {
  const { data: latestFileKey } = useGetUserWsKey(workspaceId);
  const { data: secret, isLoading: isSecretsLoading } = useGetProjectSecrets({
    workspaceId,
    env,
    decryptFileKey: latestFileKey!
  });

  const getValue = useCallback(
    (data: typeof secret) => {
      const sec = data?.secrets?.find(({ key: secKey }) => secKey === secretKey);
      return sec?.value || 'Not found';
    },
    [secretKey]
  );

  return (
    <FormControl label={envName}>
      <Input
        className={`w-full text-ellipsis font-mono focus:ring-transparent ${getValue(secret) === "Not found" && "text-mineshaft-500"}`}
        value={getValue(secret)}
        isReadOnly
        rightIcon={isSecretsLoading ? <Spinner /> : undefined}
      />
    </FormControl>
  );
};

type Props = {
  workspaceId: string;
  secretKey: string;
  envs: Array<{ name: string; slug: string }>;
};

export const CompareSecret = ({ workspaceId, secretKey, envs }: Props): JSX.Element => {
  // should not do anything until secretKey is available
  if (!secretKey) return <div />;

  return (
    <div className="flex flex-col">
      {envs.map(({ name, slug }) => (
        <SecretValue
          workspaceId={workspaceId}
          key={`secret-comparison-${slug}`}
          envName={name}
          env={slug}
          secretKey={secretKey}
        />
      ))}
    </div>
  );
};
