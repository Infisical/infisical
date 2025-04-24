import { useCallback, useEffect, useState } from "react";
import { MongoAbility, MongoQuery } from "@casl/ability";
import {
  faAnglesUp,
  faArrowUpRightFromSquare,
  faDownLeftAndUpRightToCenter,
  faUpRightAndDownLeftFromCenter,
  faWindowRestore
} from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
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
import { twMerge } from "tailwind-merge";

import { Button, IconButton, Spinner, Tooltip } from "@app/components/v2";
import { ProjectPermissionSet } from "@app/context/ProjectPermissionContext";

import { AccessTreeSecretPathInput } from "./nodes/FolderNode/components/AccessTreeSecretPathInput";
import { ShowMoreButtonNode } from "./nodes/ShowMoreButtonNode";
import { AccessTreeErrorBoundary, AccessTreeProvider } from "./components";
import { BasePermissionEdge } from "./edges";
import { useAccessTree } from "./hooks";
import { FolderNode, RoleNode } from "./nodes";
import { ViewMode } from "./types";

export type AccessTreeProps = {
  permissions: MongoAbility<ProjectPermissionSet, MongoQuery>;
};

const EdgeTypes = { base: BasePermissionEdge };

const NodeTypes = { role: RoleNode, folder: FolderNode, showMoreButton: ShowMoreButtonNode };

const AccessTreeContent = ({ permissions }: AccessTreeProps) => {
  const [selectedPath, setSelectedPath] = useState<string>("/");
  const accessTreeData = useAccessTree(permissions, selectedPath);
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
  }, [selectedPath, environment]);

  useEffect(() => {
    let timer: NodeJS.Timeout;
    if (initialRender) {
      timer = setTimeout(() => {
        goToRootNode();
        setInitialRender(false);
      }, 500);
    }
    return () => clearTimeout(timer);
  }, [nodes, edges, getViewport(), initialRender, goToRootNode]);

  const handleToggleModalView = () =>
    setViewMode((prev) => (prev === ViewMode.Modal ? ViewMode.Docked : ViewMode.Modal));

  const handleToggleUndockedView = () =>
    setViewMode((prev) => (prev === ViewMode.Undocked ? ViewMode.Docked : ViewMode.Undocked));

  const undockButtonLabel = `${viewMode === ViewMode.Undocked ? "Dock" : "Undock"} View`;
  const windowButtonLabel = `${viewMode === ViewMode.Modal ? "Dock" : "Expand"} View`;

  return (
    <div
      className={twMerge(
        "w-full",
        viewMode === ViewMode.Modal && "fixed inset-0 z-50 p-10",
        viewMode === ViewMode.Undocked &&
          "fixed bottom-4 left-20 z-50 h-[40%] w-[38%] min-w-[32rem] lg:w-[34%]"
      )}
    >
      <div
        className={twMerge(
          "mb-4 h-full w-full rounded-lg border border-mineshaft-600 bg-mineshaft-900 transition-transform duration-500",
          viewMode === ViewMode.Docked ? "relative p-4" : "relative p-0"
        )}
      >
        {viewMode === ViewMode.Docked && (
          <div className="mb-4 flex items-start justify-between border-b border-mineshaft-400 pb-4">
            <div>
              <h3 className="text-lg font-semibold text-mineshaft-100">Access Tree</h3>
              <p className="text-sm leading-3 text-mineshaft-400">
                Visual access policies for the configured role.
              </p>
            </div>
            <div className="whitespace-nowrap">
              <Button
                variant="outline_bg"
                colorSchema="secondary"
                type="submit"
                className="h-10 rounded-r-none bg-mineshaft-700"
                leftIcon={<FontAwesomeIcon icon={faWindowRestore} />}
                onClick={handleToggleUndockedView}
              >
                Undock
              </Button>
              <Button
                variant="outline_bg"
                colorSchema="secondary"
                type="submit"
                className="h-10 rounded-l-none bg-mineshaft-600"
                leftIcon={<FontAwesomeIcon icon={faUpRightAndDownLeftFromCenter} />}
                onClick={handleToggleModalView}
              >
                Expand
              </Button>
            </div>
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
              className="rounded-md border border-mineshaft"
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
                  <Spinner />
                </Panel>
              )}
              {viewMode !== ViewMode.Docked && (
                <Panel position="top-right" className="flex gap-1.5">
                  {viewMode !== ViewMode.Undocked && (
                    <AccessTreeSecretPathInput
                      placeholder="Provide a path, default is /"
                      environment={environment}
                      value={selectedPath}
                      onChange={setSelectedPath}
                    />
                  )}
                  <Tooltip position="bottom" align="center" content={undockButtonLabel}>
                    <IconButton
                      className="ml-1 w-10 rounded"
                      colorSchema="secondary"
                      variant="plain"
                      onClick={handleToggleUndockedView}
                      ariaLabel={undockButtonLabel}
                    >
                      <FontAwesomeIcon
                        icon={
                          viewMode === ViewMode.Undocked
                            ? faArrowUpRightFromSquare
                            : faWindowRestore
                        }
                      />
                    </IconButton>
                  </Tooltip>
                  <Tooltip align="end" position="bottom" content={windowButtonLabel}>
                    <IconButton
                      className="w-10 rounded"
                      colorSchema="secondary"
                      variant="plain"
                      onClick={handleToggleModalView}
                      ariaLabel={windowButtonLabel}
                    >
                      <FontAwesomeIcon
                        icon={
                          viewMode === ViewMode.Modal
                            ? faDownLeftAndUpRightToCenter
                            : faUpRightAndDownLeftFromCenter
                        }
                      />
                    </IconButton>
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
              <Background color="#5d5f64" bgColor="#111419" variant={BackgroundVariant.Dots} />
              <Controls
                position="bottom-left"
                showInteractive={false}
                onFitView={() => fitView({ duration: 800 })}
              >
                <ControlButton onClick={goToRootNode}>
                  <Tooltip position="right" content="Go to root folder">
                    <FontAwesomeIcon icon={faAnglesUp} />
                  </Tooltip>
                </ControlButton>
              </Controls>
            </ReactFlow>
          </div>
        </div>
      </div>
    </div>
  );
};

export const AccessTree = (props: AccessTreeProps) => {
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
