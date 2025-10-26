/* eslint-disable no-nested-ternary */
import { useEffect, useState } from "react";
import {
  faChevronRight,
  faExclamationTriangle,
  faEye,
  faEyeSlash
} from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import * as Collapsible from "@radix-ui/react-collapsible";
import { AxiosError } from "axios";
import { twMerge } from "tailwind-merge";

import { createNotification } from "@app/components/notifications";
import { FormControl, FormLabel, SecretInput, Spinner, Tooltip } from "@app/components/v2";
import { useProject } from "@app/context";
import { useGetSecretReferenceTree } from "@app/hooks/api";
import { ApiErrorTypes, TApiErrors, TSecretReferenceTraceNode } from "@app/hooks/api/types";

import style from "./SecretReferenceDetails.module.css";

type Props = {
  environment: string;
  secretPath: string;
  secretKey: string;
};

const INTERPOLATION_SYNTAX_REG = /\${([^}]+)}/;
export const hasSecretReference = (value: string | undefined) =>
  value ? INTERPOLATION_SYNTAX_REG.test(value) : false;

const createNodeId = (node: TSecretReferenceTraceNode): string =>
  `${node.environment}:${node.secretPath}:${node.key}`;

const isCircularReference = (
  node: TSecretReferenceTraceNode,
  visitedPath: Set<string>
): boolean => {
  const nodeId = createNodeId(node);
  return visitedPath.has(nodeId);
};

const hasCircularReferences = (
  node: TSecretReferenceTraceNode,
  visitedPath: Set<string> = new Set()
): boolean => {
  const nodeId = createNodeId(node);

  if (visitedPath.has(nodeId)) {
    return true;
  }

  const newVisitedPath = new Set([...visitedPath, nodeId]);

  return node.children.some((child) => hasCircularReferences(child, newVisitedPath));
};

export const SecretReferenceNode = ({
  node,
  isRoot,
  secretKey,
  visitedPath = new Set()
}: {
  node: TSecretReferenceTraceNode;
  isRoot?: boolean;
  secretKey?: string;
  visitedPath?: Set<string>;
}) => {
  const [isOpen, setIsOpen] = useState(false);

  const nodeId = createNodeId(node);
  const isCircular = !isRoot && isCircularReference(node, visitedPath);

  const newVisitedPath = isCircular ? visitedPath : new Set([...visitedPath, nodeId]);

  const safeChildren = isCircular
    ? []
    : node.children.filter((child) => !isCircularReference(child, newVisitedPath));
  const hasChildren = safeChildren.length > 0;

  return (
    <li>
      <Collapsible.Root open={isOpen} className="" onOpenChange={setIsOpen}>
        <Collapsible.Trigger
          className={twMerge(
            hasChildren && "decoration-bunker-4ø00 underline-offset-4 data-[state=open]:underline",
            "data-[state=open]:[&>svg]:rotate-90 data-[state=open]:[&>svg]:text-yellow-500"
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
              {safeChildren.map((el, index) => (
                <SecretReferenceNode
                  node={el}
                  key={`${el.key}-${index + 1}`}
                  visitedPath={newVisitedPath}
                />
              ))}
            </ul>
          )}
        </Collapsible.Content>
      </Collapsible.Root>
    </li>
  );
};

export const SecretReferenceTree = ({ secretPath, environment, secretKey }: Props) => {
  const { currentProject } = useProject();
  const projectId = currentProject?.id || "";

  const { data, isPending, isError, error } = useGetSecretReferenceTree({
    secretPath,
    environmentSlug: environment,
    projectId,
    secretKey
  });

  const tree = data?.tree;
  const secretValue = data?.value;

  // Check if the tree contains circular references
  const hasCirculars = tree ? hasCircularReferences(tree) : false;

  useEffect(() => {
    if (error instanceof AxiosError) {
      const err = error?.response?.data as TApiErrors;

      if (err?.error === ApiErrorTypes.CustomForbiddenError) {
        createNotification({
          title: "You don't have permission to view reference tree",
          text: "You don't have permission to view one or more of the referenced secrets.",
          type: "error"
        });
        return;
      }
      createNotification({
        title: "Error fetching secret reference tree",
        text: "Please try again later.",
        type: "error"
      });
    }
  }, [error]);

  if (isPending) {
    return (
      <div className="flex items-center justify-center py-4">
        <Spinner className="text-mineshaft-400" />
      </div>
    );
  }

  if (tree?.children?.length === 0) {
    return (
      <div className="flex items-center justify-center py-4">
        <span className="text-mineshaft-400">This secret does not contain references</span>
      </div>
    );
  }

  return (
    <div>
      <FormControl
        label="Expanded value"
        tooltipText={
          hasCirculars
            ? "This secret contains circular references. Value shown is resolved once, with circular paths truncated in the reference tree below."
            : undefined
        }
        tooltipClassName="max-w-md break-words"
      >
        <SecretInput
          key="value-overriden"
          isReadOnly
          value={secretValue}
          containerClassName="text-bunker-300 hover:border-primary-400/50 border border-mineshaft-600 bg-bunker-700 px-2 py-1.5"
        />
      </FormControl>
      <FormLabel className="mb-2" label="Reference Tree" />
      <div className="relative max-h-96 thin-scrollbar overflow-auto rounded-md border border-mineshaft-600 bg-bunker-700 py-6 text-sm text-mineshaft-200">
        {isError ? (
          <div className="flex items-center justify-center py-4">
            <FontAwesomeIcon icon={faExclamationTriangle} className="mr-2 text-red-500" />
            <p className="text-red-500">Error fetching secret reference tree</p>
          </div>
        ) : tree ? (
          <ul className={style.tree}>
            <SecretReferenceNode node={tree} isRoot secretKey={secretKey} />
          </ul>
        ) : null}
      </div>
      <div className="mt-2 text-sm text-mineshaft-400">
        Click a secret key to view its sub-references.
      </div>
    </div>
  );
};
