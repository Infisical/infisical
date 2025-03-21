import { useCallback, useEffect } from "react";
import { MongoAbility, MongoQuery } from "@casl/ability";
import {
  faArrowUpRightFromSquare,
  faUpRightAndDownLeftFromCenter,
  faWindowRestore
} from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  Background,
  BackgroundVariant,
  ConnectionLineType,
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

import { AccessTreeErrorBoundary, AccessTreeProvider, PermissionSimulation } from "./components";
import { BasePermissionEdge } from "./edges";
import { useAccessTree } from "./hooks";
import { FolderNode, RoleNode } from "./nodes";
import { ViewMode } from "./types";

export type AccessTreeProps = {
  permissions: MongoAbility<ProjectPermissionSet, MongoQuery>;
};

const EdgeTypes = { base: BasePermissionEdge };

const NodeTypes = { role: RoleNode, folder: FolderNode };

const AccessTreeContent = ({ permissions }: AccessTreeProps) => {
  const accessTreeData = useAccessTree(permissions);
  const { edges, nodes, isLoading, viewMode, setViewMode } = accessTreeData;

  const { fitView, getViewport, setCenter } = useReactFlow();

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
    setTimeout(() => {
      fitView({
        padding: 0.2,
        duration: 1000,
        maxZoom: 1
      });
    }, 1);
  }, [fitView, nodes, edges, getViewport()]);

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
              fitView
              onNodeClick={onNodeClick}
              colorMode="dark"
              nodesDraggable={false}
              edgesReconnectable={false}
              nodesConnectable={false}
              connectionLineType={ConnectionLineType.SmoothStep}
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
                  <Tooltip position="bottom" align="center" content={undockButtonLabel}>
                    <IconButton
                      className="mr-1 rounded"
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
                      className="rounded"
                      colorSchema="secondary"
                      variant="plain"
                      onClick={handleToggleModalView}
                      ariaLabel={windowButtonLabel}
                    >
                      <FontAwesomeIcon
                        icon={
                          viewMode === ViewMode.Modal
                            ? faArrowUpRightFromSquare
                            : faUpRightAndDownLeftFromCenter
                        }
                      />
                    </IconButton>
                  </Tooltip>
                </Panel>
              )}
              <PermissionSimulation {...accessTreeData} />
              <Background color="#5d5f64" bgColor="#111419" variant={BackgroundVariant.Dots} />
              <Controls position="bottom-left" />
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
