import { useCallback, useEffect, useState } from "react";
import { MongoAbility, MongoQuery } from "@casl/ability";
import {
  Background,
  BackgroundVariant,
  ConnectionLineType,
  ControlButton,
  Controls,
  Node,
  NodeMouseHandler,
  Panel,
  ReactFlow,
  ReactFlowProvider,
  useReactFlow
} from "@xyflow/react";
import {
  ChevronsUpIcon,
  LoaderCircleIcon,
  Maximize2Icon,
  PanelsTopLeftIcon,
  XIcon
} from "lucide-react";
import { twMerge } from "tailwind-merge";

import {
  Button,
  ButtonGroup,
  IconButton,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Tooltip,
  TooltipContent,
  TooltipTrigger
} from "@app/components/v3";
import { ProjectPermissionSet, ProjectPermissionSub } from "@app/context/ProjectPermissionContext";

import { AccessTreeSecretPathInput } from "./nodes/FolderNode/components/AccessTreeSecretPathInput";
import { ShowMoreButtonNode } from "./nodes/ShowMoreButtonNode";
import { AccessTreeErrorBoundary, AccessTreeProvider } from "./components";
import { BasePermissionEdge } from "./edges";
import { useAccessTree } from "./hooks";
import { FolderNode, RoleNode } from "./nodes";
import { ViewMode } from "./types";

export type AccessTreeProps = {
  permissions: MongoAbility<ProjectPermissionSet, MongoQuery>;
  subject: ProjectPermissionSub;
  onClose: () => void;
};

const EdgeTypes = { base: BasePermissionEdge };

const NodeTypes = { role: RoleNode, folder: FolderNode, showMoreButton: ShowMoreButtonNode };

const AccessTreeContent = ({ permissions, subject, onClose }: AccessTreeProps) => {
  const [selectedPath, setSelectedPath] = useState<string>("/");
  const accessTreeData = useAccessTree(permissions, selectedPath, subject);
  const { edges, nodes, isLoading, viewMode, setViewMode, environment } = accessTreeData;
  const [initialRender, setInitialRender] = useState(true);

  useEffect(() => {
    setSelectedPath("/");
  }, [environment]);

  const { getViewport, setCenter, fitView } = useReactFlow();

  const goToRootNode = useCallback(() => {
    const roleNode = nodes.find((node) => node.type === "role");
    if (roleNode) {
      setCenter(
        roleNode.position.x + (roleNode.width ? roleNode.width / 2 : 0),
        roleNode.position.y + (roleNode.height ? roleNode.height / 2 : 0),
        { duration: 800, zoom: 1 }
      );
    }
  }, [nodes, setCenter]);

  const onNodeClick: NodeMouseHandler<Node> = useCallback(
    (_, node) => {
      setCenter(
        node.position.x + (node.width ? node.width / 2 : 0),
        node.position.y + (node.height ? node.height / 2 + 50 : 50),
        { duration: 1000, zoom: 1 }
      );
    },
    [setCenter]
  );

  useEffect(() => {
    setInitialRender(true);
  }, [selectedPath, environment, subject, viewMode]);

  useEffect(() => {
    let timer: NodeJS.Timeout;
    if (initialRender) {
      timer = setTimeout(() => {
        fitView({ duration: 500 });
        setInitialRender(false);
      }, 50);
    }
    return () => clearTimeout(timer);
  }, [nodes, edges, getViewport(), initialRender, fitView]);

  const handleToggleModalView = () =>
    setViewMode((prev) => (prev === ViewMode.Modal ? ViewMode.Docked : ViewMode.Modal));

  const handleToggleView = () =>
    setViewMode((prev) => (prev === ViewMode.Modal ? ViewMode.Undocked : ViewMode.Modal));

  const expandButtonLabel = viewMode === ViewMode.Modal ? "Anchor View" : "Expand View";
  const hideButtonLabel = "Hide Access Tree";

  return (
    <div
      className={twMerge(
        "mt-4 w-full",
        viewMode === ViewMode.Modal && "fixed inset-0 z-50 p-10",
        viewMode === ViewMode.Undocked &&
          "fixed bottom-4 left-20 z-50 h-[40%] w-[38%] min-w-lg lg:w-[34%]"
      )}
    >
      <div
        className={twMerge(
          "mb-4 h-full w-full rounded-lg border border-border bg-card transition-transform duration-300 motion-reduce:transition-none",
          viewMode === ViewMode.Docked ? "relative p-4" : "relative p-0"
        )}
      >
        {viewMode === ViewMode.Docked && (
          <div className="mb-4 flex flex-wrap items-start justify-between gap-3 border-b border-border pb-4">
            <div>
              <h3 className="text-lg font-semibold text-foreground">Access Tree</h3>
              <p className="text-sm text-muted">Visual access policies for the configured role.</p>
            </div>
            <ButtonGroup aria-label="Access tree layout">
              <Button variant="outline" type="button" onClick={handleToggleView}>
                <PanelsTopLeftIcon />
                Undock
              </Button>
              <Button variant="outline" type="button" onClick={handleToggleModalView}>
                <Maximize2Icon />
                Expand
              </Button>
            </ButtonGroup>
          </div>
        )}
        <div
          className={twMerge(
            "flex items-center space-x-4",
            viewMode === ViewMode.Docked ? "h-96" : "h-full"
          )}
        >
          <div className="h-full w-full">
            <ReactFlow
              className="rounded-md border border-border"
              nodes={nodes}
              edges={edges}
              edgeTypes={EdgeTypes}
              nodeTypes={NodeTypes}
              onNodeClick={onNodeClick}
              colorMode="dark"
              nodesDraggable={false}
              edgesReconnectable={false}
              nodesConnectable={false}
              connectionLineType={ConnectionLineType.SmoothStep}
              minZoom={0.001}
              proOptions={{
                hideAttribution: false // we need pro license if we want to hide
              }}
            >
              {isLoading && (
                <Panel className="flex h-full w-full items-center justify-center">
                  <LoaderCircleIcon
                    className="size-8 animate-spin text-accent"
                    aria-label="Loading access tree"
                  />
                </Panel>
              )}
              {viewMode !== ViewMode.Undocked && (
                <Panel position="top-left" className="flex gap-2">
                  <Select value={environment} onValueChange={accessTreeData.setEnvironment}>
                    <SelectTrigger className="w-60" aria-label="Environment">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent position="popper">
                      {Object.values(accessTreeData.environments).map((env) => (
                        <SelectItem key={env.slug} value={env.slug}>
                          {env.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <AccessTreeSecretPathInput
                    placeholder="Provide a path, default is /"
                    environment={environment}
                    value={selectedPath}
                    onChange={setSelectedPath}
                  />
                </Panel>
              )}
              {viewMode !== ViewMode.Docked && (
                <Panel position="top-right" className="flex gap-2">
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <IconButton
                        variant="outline"
                        onClick={handleToggleView}
                        aria-label={expandButtonLabel}
                      >
                        {viewMode === ViewMode.Undocked ? <Maximize2Icon /> : <PanelsTopLeftIcon />}
                      </IconButton>
                    </TooltipTrigger>
                    <TooltipContent side="bottom">{expandButtonLabel}</TooltipContent>
                  </Tooltip>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <IconButton variant="outline" onClick={onClose} aria-label={hideButtonLabel}>
                        <XIcon />
                      </IconButton>
                    </TooltipTrigger>
                    <TooltipContent side="bottom" align="end">
                      {hideButtonLabel}
                    </TooltipContent>
                  </Tooltip>
                </Panel>
              )}
              {viewMode === ViewMode.Docked && (
                <Panel position="top-right" className="flex gap-1.5">
                  <AccessTreeSecretPathInput
                    placeholder="Provide a path, default is /"
                    environment={environment}
                    value={selectedPath}
                    onChange={setSelectedPath}
                  />
                </Panel>
              )}
              <Background
                color="var(--color-border)"
                bgColor="var(--color-card)"
                variant={BackgroundVariant.Dots}
              />
              <Controls
                position="bottom-left"
                showInteractive={false}
                onFitView={() => fitView({ duration: 800 })}
              >
                <Tooltip>
                  <TooltipTrigger asChild>
                    <ControlButton onClick={goToRootNode} aria-label="Go to root folder">
                      <ChevronsUpIcon />
                    </ControlButton>
                  </TooltipTrigger>
                  <TooltipContent side="right">Go to root folder</TooltipContent>
                </Tooltip>
              </Controls>
            </ReactFlow>
          </div>
        </div>
      </div>
    </div>
  );
};

export const AccessTree = (props: AccessTreeProps) => {
  const { subject } = props;
  if (!subject) return null;

  return (
    <AccessTreeErrorBoundary {...props}>
      <AccessTreeProvider>
        <ReactFlowProvider>
          <AccessTreeContent {...props} />
        </ReactFlowProvider>
      </AccessTreeProvider>
    </AccessTreeErrorBoundary>
  );
};
