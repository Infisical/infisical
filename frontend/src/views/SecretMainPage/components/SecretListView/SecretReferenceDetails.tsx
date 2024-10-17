import { twMerge } from "tailwind-merge";

import { FormControl, SecretInput, Spinner, Tag, Tooltip } from "@app/components/v2";
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
      <div className="py-2 text-sm">
        <div>
          {node.key}
          <Tooltip content={node.value}>
            <span
              className={twMerge(
                "ml-2 rounded border border-gray-400 px-1 text-xs text-gray-400",
                !node.value && "border-red-400 text-red-400"
              )}
            >
              {node.value ? "Reveal Value" : "Empty"}
            </span>
          </Tooltip>
        </div>
        <div className="mt-2">
          <div className="flex items-center space-x-2">
            <div className="flex items-center">
              <Tag
                size="xs"
                className="mr-0 flex items-center rounded-r-none border border-mineshaft-500"
              >
                <div>Environment</div>
              </Tag>
              <Tag
                size="xs"
                className="flex items-center rounded-l-none border border-mineshaft-500 bg-mineshaft-900 pl-1"
              >
                <div className="max-w-[150px] overflow-hidden text-ellipsis whitespace-nowrap">
                  {node.environment}
                </div>
              </Tag>
            </div>
            <div className="flex items-center">
              <Tag
                size="xs"
                className="mr-0 flex items-center rounded-r-none border border-mineshaft-500"
              >
                <div>Secret Path</div>
              </Tag>
              <Tag
                size="xs"
                className="flex items-center rounded-l-none border border-mineshaft-500 bg-mineshaft-900 pl-1"
              >
                <div className="max-w-[150px] overflow-hidden text-ellipsis whitespace-nowrap">
                  {node.secretPath}
                </div>
              </Tag>
            </div>
          </div>
        </div>
        <div className="w-full border-b border-gray-800 py-1" />
      </div>
    )}
    {node.children.length > 0 && (
      <div className="border-l border-gray-600 pl-6 transition-all hover:border-primary-600">
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
      <div className="max-h-96 overflow-auto">
        {tree && <SecretReferenceNode node={tree} isRoot />}
      </div>
    </div>
  );
};
