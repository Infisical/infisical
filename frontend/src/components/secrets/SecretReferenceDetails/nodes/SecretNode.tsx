/* eslint-disable no-nested-ternary */
import { useCallback, useContext, useRef, useState } from "react";
import { faQuestionCircle } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { useNavigate, useParams } from "@tanstack/react-router";
import { Handle, NodeProps, Position } from "@xyflow/react";
import { FolderIcon, KeyIcon, LayersIcon } from "lucide-react";
import { twMerge } from "tailwind-merge";

import { Tooltip } from "@app/components/v2";
import { Badge } from "@app/components/v3";
import { ROUTE_PATHS } from "@app/const/routes";
import { useProject } from "@app/context";

import { SecretReferenceCloseContext } from "../SecretReferenceContext";
import { SecretNodeData } from "../utils/convertToFlowElements";

export const SecretNode = ({ data }: NodeProps & { data: SecretNodeData }) => {
  const { secretKey, environment, secretPath, isRoot, isCircular } = data;

  const capitalizedEnv = environment.charAt(0).toUpperCase() + environment.slice(1);

  const pathTextRef = useRef<HTMLSpanElement>(null);
  const envTextRef = useRef<HTMLSpanElement>(null);
  const [isPathTruncated, setIsPathTruncated] = useState(false);
  const [isEnvTruncated, setIsEnvTruncated] = useState(false);

  const navigate = useNavigate();
  const routeParams = useParams({ strict: false });
  const { currentProject } = useProject();
  const onClose = useContext(SecretReferenceCloseContext);

  const checkPathTruncation = useCallback(() => {
    const el = pathTextRef.current;
    if (el) {
      setIsPathTruncated(el.scrollWidth > el.clientWidth);
    }
  }, []);

  const checkEnvTruncation = useCallback(() => {
    const el = envTextRef.current;
    if (el) {
      setIsEnvTruncated(el.scrollWidth > el.clientWidth);
    }
  }, []);

  const handleNavigate = useCallback(() => {
    if (isRoot) return;
    onClose?.();
    navigate({
      to: ROUTE_PATHS.SecretManager.SecretDashboardPage.path,
      params: {
        orgId: routeParams.orgId as string,
        projectId: currentProject?.id || "",
        envSlug: environment
      },
      search: {
        secretPath,
        search: secretKey
      }
    });
  }, [
    navigate,
    routeParams.orgId,
    currentProject,
    environment,
    secretPath,
    secretKey,
    isRoot,
    onClose
  ]);

  const envBadge = (
    <Badge
      variant="neutral"
      className="max-w-[50%] shrink-0"
      isTruncatable
      onMouseEnter={checkEnvTruncation}
    >
      <LayersIcon className="size-3" />
      <span ref={envTextRef}>{capitalizedEnv}</span>
    </Badge>
  );

  const pathBadge = (
    <Badge variant="neutral" className="min-w-0" isTruncatable onMouseEnter={checkPathTruncation}>
      <FolderIcon />
      <span ref={pathTextRef}>{secretPath}</span>
    </Badge>
  );

  return (
    <>
      <Handle
        type="target"
        className="pointer-events-none cursor-pointer! opacity-0"
        position={Position.Top}
      />
      <Tooltip
        className="text-xs"
        content={isRoot ? "This is the secret whose dependencies are being viewed" : undefined}
        isDisabled={!isRoot}
      >
        <div className="relative">
          {isCircular && (
            <Tooltip content="This secret contains circular references. Circular references are not expanded and will lead to errors when you attempt to use them.">
              <Badge variant="danger" className="absolute -top-6 right-0">
                Circular
                <FontAwesomeIcon className="size-2" icon={faQuestionCircle} />
              </Badge>
            </Tooltip>
          )}
          <div
            className={twMerge(
              "flex h-full w-full items-stretch gap-2.5 rounded-md border border-mineshaft bg-mineshaft-800 p-2 font-inter shadow-lg",
              isCircular && "border-red/40",
              isRoot && "border-project/40",
              !isRoot && "cursor-pointer transition-colors hover:border-mineshaft-400"
            )}
            onClick={!isRoot ? handleNavigate : undefined}
            role={!isRoot ? "button" : undefined}
            tabIndex={!isRoot ? 0 : undefined}
            onKeyDown={
              !isRoot
                ? (e) => {
                    if (e.key === "Enter") handleNavigate();
                  }
                : undefined
            }
          >
            <Badge
              variant={isCircular ? "danger" : isRoot ? "project" : "neutral"}
              className="!aspect-square h-auto !w-auto !min-w-0 shrink-0 self-stretch"
            >
              <KeyIcon className="size-4" />
            </Badge>
            <div className="flex w-full min-w-0 flex-col">
              <span
                className={twMerge(
                  "truncate text-xs text-mineshaft-100",
                  isRoot && "font-semibold"
                )}
              >
                {secretKey}
              </span>
              <div className="mt-0.5 flex items-center gap-1.5">
                {isEnvTruncated ? (
                  <Tooltip className="max-w-xs text-xs break-all" content={capitalizedEnv}>
                    {envBadge}
                  </Tooltip>
                ) : (
                  envBadge
                )}
                {isPathTruncated ? (
                  <Tooltip className="max-w-xs text-xs break-all" content={secretPath}>
                    {pathBadge}
                  </Tooltip>
                ) : (
                  pathBadge
                )}
              </div>
            </div>
          </div>
        </div>
      </Tooltip>
      <Handle
        type="source"
        className="pointer-events-none cursor-pointer! opacity-0"
        position={Position.Bottom}
      />
    </>
  );
};
