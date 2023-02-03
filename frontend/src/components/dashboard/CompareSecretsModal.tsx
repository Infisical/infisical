import { SetStateAction, useEffect, useState } from 'react';

import { WorkspaceEnv } from '~/pages/dashboard/[id]';

import getSecretsForProject from '../utilities/secrets/getSecretsForProject';
import { Modal, ModalContent } from '../v2';

interface Secrets {
  label: string;
  secret: string;
}

interface CompareSecretsModalProps {
  compareModal: boolean;
  setCompareModal: React.Dispatch<SetStateAction<boolean>>;
  selectedEnv: WorkspaceEnv;
  workspaceEnvs: WorkspaceEnv[];
  workspaceId: string;
  currentSecret: {
    key: string;
    value: string;
  };
}

const CompareSecretsModal = ({
  compareModal,
  setCompareModal,
  selectedEnv,
  workspaceEnvs,
  workspaceId,
  currentSecret
}: CompareSecretsModalProps) => {
  const [secrets, setSecrets] = useState<Secrets[]>([]);

  const getEnvSecrets = async () => {
    const workspaceEnvironments = workspaceEnvs.filter((env) => env !== selectedEnv);
    const newSecrets = await Promise.all(
      workspaceEnvironments.map(async (env) => {
        const allSecrets = await getSecretsForProject({ env: env.slug, workspaceId });
        const secret =
          allSecrets.find((item) => item.key === currentSecret.key)?.value ?? 'Not found';
        return { label: env.name, secret };
      })
    );
    setSecrets([{ label: selectedEnv.name, secret: currentSecret.value }, ...newSecrets]);
  };

  useEffect(() => {
    if (compareModal) {
      (async () => {
        await getEnvSecrets();
      })();
    }
  }, [compareModal]);

  return (
    <Modal isOpen={compareModal} onOpenChange={setCompareModal}>
      <ModalContent title={currentSecret?.key} onOpenAutoFocus={(e) => e.preventDefault()}>
        <div className="space-y-4">
          {secrets.map((item) => (
            <div key={`${currentSecret.key}${item.label}`} className="space-y-1">
              <p className="text-sm text-bunker-300">{item.label}</p>
              <input
                defaultValue={item.secret}
                className="h-no-capture text-md min-w-16 no-scrollbar::-webkit-scrollbar peer z-10 w-full rounded-md bg-bunker-800 px-2 py-1.5 font-mono text-gray-400 caret-white outline-none duration-200 no-scrollbar focus:ring-2 focus:ring-primary/50 "
                readOnly
              />
            </div>
          ))}
        </div>
      </ModalContent>
    </Modal>
  );
};
export default CompareSecretsModal;
