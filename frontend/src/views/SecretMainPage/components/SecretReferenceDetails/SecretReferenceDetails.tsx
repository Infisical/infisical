import { faEye, faEyeSlash } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { twMerge } from "tailwind-merge";

import { FormControl, FormLabel, SecretInput, Spinner, Tooltip } from "@app/components/v2";
import { useWorkspace } from "@app/context";
import { useToggle } from "@app/hooks";
import { useGetSecretReferenceTree } from "@app/hooks/api";
import { TSecretReferenceTraceNode } from "@app/hooks/api/types";

import style from "./SecretReferenceDetails.module.css";

type Props = {
  environment: string;
  secretPath: string;
  secretKey: string;
};

const INTERPOLATION_SYNTAX_REG = /\${([^}]+)}/;
export const hasSecretReference = (value: string | undefined) =>
  value ? INTERPOLATION_SYNTAX_REG.test(value) : false;

export const SecretReferenceNode = ({
  node,
  isRoot,
  secretKey
}: {
  node: TSecretReferenceTraceNode;
  isRoot?: boolean;
  secretKey?: string;
}) => {
  const [isOpen, setIsOpen] = useToggle();
  return (
    <li>
      <details
        open={isOpen}
        onToggle={(el) => {
          el.preventDefault();
          el.stopPropagation();
          setIsOpen.toggle();
        }}
      >
        <summary className={twMerge(node.children.length > 0 && !isOpen && "text-primary")}>
          {isRoot
            ? secretKey
            : `${node.environment}${
                node.secretPath === "/" ? "" : node.secretPath.split("/").join(".")
              }.${node.key}`}
          <Tooltip className="max-w-md break-words" content={node.value}>
            <span
              className={twMerge("ml-1 px-1 text-xs text-gray-400", !node.value && "text-red-400")}
            >
              <FontAwesomeIcon icon={node.value ? faEye : faEyeSlash} />
            </span>
          </Tooltip>
        </summary>
        {node.children.length > 0 && (
          <ul>
            {node.children.map((el, index) => (
              <SecretReferenceNode node={el} key={`${el.key}-${index + 1}`} />
            ))}
          </ul>
        )}
      </details>
    </li>
  );
};

export const SecretReferenceTree = ({ secretPath, environment, secretKey }: Props) => {
  const { currentWorkspace } = useWorkspace();
  const projectId = currentWorkspace?.id || "";

  const { data, isLoading } = useGetSecretReferenceTree({
    secretPath,
    environmentSlug: environment,
    projectId,
    secretKey
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
      <FormLabel className="mb-2" label="Reference Tree" />
      <div className="relative max-h-96 overflow-auto rounded bg-bunker-700 py-2 pt-6 text-sm">
        {tree && (
          <ul className={style.tree}>
            <SecretReferenceNode node={tree} isRoot secretKey={secretKey} />
          </ul>
        )}
      </div>
      <div className="mt-2 text-sm text-mineshaft-400">
        Click a secret key to view its sub-references.
      </div>
    </div>
  );
};
