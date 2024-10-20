import { faEye, faEyeSlash } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { twMerge } from "tailwind-merge";

import { FormControl, SecretInput, Spinner, Tooltip } from "@app/components/v2";
import { useWorkspace } from "@app/context";
import { useGetSecretReferenceTree } from "@app/hooks/api";
import { SecretV3RawSanitized, TSecretReferenceTraceNode } from "@app/hooks/api/types";

type Props = {
  environment: string;
  secretPath: string;
  secret: SecretV3RawSanitized;
};

export const SecretReferenceNode = ({
  node,
  isRoot
}: {
  node: TSecretReferenceTraceNode;
  isRoot?: boolean;
}) => (
  <div>
    {isRoot ? (
      <FormControl label="Reference value" className="sticky top-0 mb-0 bg-mineshaft-800">
        <SecretInput
          key="value-overriden"
          isReadOnly
          value={node.value}
          containerClassName="text-bunker-300 hover:border-primary-400/50 border border-mineshaft-600 bg-bunker-800  px-2 py-1.5"
        />
      </FormControl>
    ) : (
      <div className="relative bg-bunker-700 py-2 text-sm">
        <div className="tree-line flex items-center">
          {`${node.environment}${
            node.secretPath === "/" ? "" : node.secretPath.split("/").join(".")
          }.${node.key}`}
          <Tooltip className="break-words" content={node.value}>
            <span
              className={twMerge("ml-1 px-1 text-xs text-gray-400", !node.value && "text-red-400")}
            >
              <FontAwesomeIcon icon={node.value ? faEye : faEyeSlash} />
            </span>
          </Tooltip>
        </div>
      </div>
    )}
    {node.children.length > 0 && (
      <div className="bg-bunker-700 pl-6 transition-all hover:border-gray-400">
        {node.children.map((el, index) => (
          <SecretReferenceNode node={el} key={`node-${node.key}-${index + 1}`} />
        ))}
      </div>
    )}
  </div>
);

export const SecretReferenceTree = ({ secretPath, environment, secret }: Props) => {
  const { currentWorkspace } = useWorkspace();
  const projectId = currentWorkspace?.id || "";

  const { data, isLoading } = useGetSecretReferenceTree({
    secretPath,
    environmentSlug: environment,
    projectId,
    secretKey: secret?.key
  });

  const tree = data?.tree;
  const secretValue = data?.value;

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-4">
        <Spinner size="xs" />
      </div>
    );
  }

  return (
    <div>
      <FormControl label="Expanded value">
        <SecretInput
          key="value-overriden"
          isReadOnly
          value={secretValue}
          containerClassName="text-bunker-300 hover:border-primary-400/50 border border-mineshaft-600 bg-bunker-800  px-2 py-1.5"
        />
      </FormControl>
      <div className="max-h-96 overflow-auto rounded">
        {tree && <SecretReferenceNode node={tree} isRoot />}
      </div>
    </div>
  );
};
