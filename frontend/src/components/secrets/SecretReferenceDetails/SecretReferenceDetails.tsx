import { useState } from "react";
import { faChevronRight, faEye, faEyeSlash } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import * as Collapsible from "@radix-ui/react-collapsible";
import { twMerge } from "tailwind-merge";

import { FormControl, FormLabel, SecretInput, Spinner, Tooltip } from "@app/components/v2";
import { useWorkspace } from "@app/context";
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
  const [isOpen, setIsOpen] = useState(false);
  const hasChildren = node.children.length > 0;

  return (
    <li>
      <Collapsible.Root open={isOpen} className="" onOpenChange={setIsOpen}>
        <Collapsible.Trigger
          className={twMerge(
            hasChildren && "decoration-bunker-4ø00 underline-offset-4 data-[state=open]:underline",
            "[&>svg]:data-[state=open]:rotate-[90deg] [&>svg]:data-[state=open]:text-yellow-500"
          )}
          disabled={!hasChildren}
        >
          {hasChildren && (
            <FontAwesomeIcon
              icon={faChevronRight}
              className="d mr-2 text-mineshaft-400 transition-transform duration-300 ease-linear"
              aria-hidden
            />
          )}
          {isRoot
            ? secretKey
            : `${node.environment}${
                node.secretPath === "/" ? "" : node.secretPath.split("/").join(".")
              }.${node.key}`}
          <Tooltip className="max-w-md break-words" content={node.value}>
            <span
              className={twMerge(
                "ml-1 px-1 text-xs text-mineshaft-400",
                !node.value && "text-red-400"
              )}
            >
              <FontAwesomeIcon icon={node.value ? faEye : faEyeSlash} />
            </span>
          </Tooltip>
        </Collapsible.Trigger>
        <Collapsible.Content className={twMerge("mt-4", style.collapsibleContent)}>
          {hasChildren && (
            <ul>
              {node.children.map((el, index) => (
                <SecretReferenceNode node={el} key={`${el.key}-${index + 1}`} />
              ))}
            </ul>
          )}
        </Collapsible.Content>
      </Collapsible.Root>
    </li>
  );
};

export const SecretReferenceTree = ({ secretPath, environment, secretKey }: Props) => {
  const { currentWorkspace } = useWorkspace();
  const projectId = currentWorkspace?.id || "";

  const { data, isPending } = useGetSecretReferenceTree({
    secretPath,
    environmentSlug: environment,
    projectId,
    secretKey
  });

  const tree = data?.tree;
  const secretValue = data?.value;

  if (isPending) {
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
          containerClassName="text-bunker-300 hover:border-primary-400/50 border border-mineshaft-600 bg-bunker-700 px-2 py-1.5"
        />
      </FormControl>
      <FormLabel className="mb-2" label="Reference Tree" />
      <div className="thin-scrollbar relative max-h-96 overflow-auto rounded-md border border-mineshaft-600 bg-bunker-700 py-6 text-sm text-mineshaft-200">
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
