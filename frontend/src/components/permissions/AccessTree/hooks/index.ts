import { useEffect, useState } from "react";
import { useFormContext, useWatch } from "react-hook-form";
import { MongoAbility, MongoQuery } from "@casl/ability";
import { Edge, Node, useEdgesState, useNodesState } from "@xyflow/react";

import { ProjectPermissionSub, useWorkspace } from "@app/context";
import { ProjectPermissionSet } from "@app/context/ProjectPermissionContext";
import { useListProjectEnvironmentsFolders } from "@app/hooks/api/secretFolders/queries";
import { TSecretFolderWithPath } from "@app/hooks/api/secretFolders/types";

import { AccessTreeForm, useAccessTreeContext } from "../components";
import { PermissionAccess } from "../types";
import {
  createBaseEdge,
  createFolderNode,
  createRoleNode,
  getSubjectActionRuleMap,
  positionElements
} from "../utils";
import { createShowMoreNode } from "../utils/createShowMoreNode";

const INITIAL_FOLDERS_PER_LEVEL = 10;
const FOLDERS_INCREMENT = 10;

type LevelFolderMap = Record<
  string,
  {
    folders: TSecretFolderWithPath[];
    visibleCount: number;
    hasMore: boolean;
  }
>;

export const useAccessTree = (
  permissions: MongoAbility<ProjectPermissionSet, MongoQuery>,
  searchPath: string,
  subject: ProjectPermissionSub
) => {
  const { currentWorkspace } = useWorkspace();
  const { secretName, setSecretName, setViewMode, viewMode } = useAccessTreeContext();
  const { control } = useFormContext<AccessTreeForm>();
  const metadata = useWatch({ control, name: "metadata" });
  const [nodes, setNodes] = useNodesState<Node>([]);
  const [edges, setEdges] = useEdgesState<Edge>([]);
  const [environment, setEnvironment] = useState(currentWorkspace.environments[0]?.slug ?? "");
  const { data: environmentsFolders, isPending } = useListProjectEnvironmentsFolders(
    currentWorkspace.id
  );

  const [levelFolderMap, setLevelFolderMap] = useState<LevelFolderMap>({});
  const [totalFolderCount, setTotalFolderCount] = useState(0);

  const showMoreFolders = (parentId: string) => {
    setLevelFolderMap((prevMap) => {
      const level = prevMap[parentId];
      if (!level) return prevMap;

      const newVisibleCount = Math.min(
        level.visibleCount + FOLDERS_INCREMENT,
        level.folders.length
      );

      return {
        ...prevMap,
        [parentId]: {
          ...level,
          visibleCount: newVisibleCount,
          hasMore: newVisibleCount < level.folders.length
        }
      };
    });
  };

  const levelsWithMoreFolders = Object.entries(levelFolderMap)
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    .filter(([_, level]) => level.hasMore)
    .map(([parentId]) => parentId);

  const getLevelCounts = (parentId: string) => {
    const level = levelFolderMap[parentId];
    if (!level) return { visibleCount: 0, totalCount: 0, hasMore: false };

    return {
      visibleCount: level.visibleCount,
      totalCount: level.folders.length,
      hasMore: level.hasMore
    };
  };

  useEffect(() => {
    if (!environmentsFolders || !permissions || !environmentsFolders[environment]) return;

    const { folders } = environmentsFolders[environment];
    setTotalFolderCount(folders.length);
    const groupedFolders: Record<string, TSecretFolderWithPath[]> = {};

    const filteredFolders = folders.filter((folder) => {
      if (folder.path.startsWith(searchPath)) {
        return true;
      }

      if (
        searchPath.startsWith(folder.path) &&
        (folder.path === "/" ||
          searchPath === folder.path ||
          searchPath.indexOf("/", folder.path.length) === folder.path.length)
      ) {
        return true;
      }

      return false;
    });

    filteredFolders.forEach((folder) => {
      const parentId = folder.parentId || "";
      if (!groupedFolders[parentId]) {
        groupedFolders[parentId] = [];
      }
      groupedFolders[parentId].push(folder);
    });

    const newLevelFolderMap: LevelFolderMap = {};

    Object.entries(groupedFolders).forEach(([parentId, folderList]) => {
      const key = parentId;
      newLevelFolderMap[key] = {
        folders: folderList,
        visibleCount: Math.min(INITIAL_FOLDERS_PER_LEVEL, folderList.length),
        hasMore: folderList.length > INITIAL_FOLDERS_PER_LEVEL
      };
    });

    setLevelFolderMap(newLevelFolderMap);
  }, [permissions, environmentsFolders, environment, subject, secretName, searchPath]);

  useEffect(() => {
    if (
      !environmentsFolders ||
      !permissions ||
      !environmentsFolders[environment] ||
      Object.keys(levelFolderMap).length === 0
    )
      return;

    const { slug } = environmentsFolders[environment];

    const roleNode = createRoleNode({
      subject,
      environment: slug,
      environments: environmentsFolders
    });

    const actionRuleMap = getSubjectActionRuleMap(subject, permissions);

    const visibleFolders: TSecretFolderWithPath[] = [];
    Object.entries(levelFolderMap).forEach(([key, levelData]) => {
      if (key !== "__rootFolderId") {
        visibleFolders.push(...levelData.folders.slice(0, levelData.visibleCount));
      }
    });

    // eslint-disable-next-line no-underscore-dangle
    const rootFolder = levelFolderMap.__rootFolderId?.folders[0];

    const folderNodes = visibleFolders.map((folder) =>
      createFolderNode({
        folder,
        permissions,
        environment,
        subject,
        secretName,
        actionRuleMap,
        metadata
      })
    );

    const folderEdges: Edge[] = [];

    if (rootFolder) {
      const rootFolderNode = folderNodes.find(
        (node) => node.data.id === rootFolder.id || node.data.path === rootFolder.path
      );

      if (rootFolderNode) {
        const rootActions = Object.values(rootFolderNode.data.actions);
        let rootAccess: PermissionAccess;

        if (Object.values(rootActions).some((action) => action === PermissionAccess.Full)) {
          rootAccess = PermissionAccess.Full;
        } else if (
          Object.values(rootActions).some((action) => action === PermissionAccess.Partial)
        ) {
          rootAccess = PermissionAccess.Partial;
        } else {
          rootAccess = PermissionAccess.None;
        }

        folderEdges.push(
          createBaseEdge({
            source: roleNode.id,
            target: rootFolderNode.id,
            access: rootAccess
          })
        );
      }
    }

    folderNodes.forEach(({ data: folder }) => {
      if (rootFolder && (folder.id === rootFolder.id || folder.path === rootFolder.path)) {
        return;
      }

      const actions = Object.values(folder.actions);
      let access: PermissionAccess;

      if (Object.values(actions).some((action) => action === PermissionAccess.Full)) {
        access = PermissionAccess.Full;
      } else if (Object.values(actions).some((action) => action === PermissionAccess.Partial)) {
        access = PermissionAccess.Partial;
      } else {
        access = PermissionAccess.None;
      }

      folderEdges.push(
        createBaseEdge({
          source: folder.parentId ?? roleNode.id,
          target: folder.id,
          access
        })
      );
    });

    const addMoreButtons: Node[] = [];

    Object.entries(levelFolderMap).forEach(([parentId, levelData]) => {
      if (parentId === "__rootFolderId") return;

      const key = parentId === "null" ? null : parentId;

      if (key && levelData.hasMore) {
        const showMoreButtonNode = createShowMoreNode({
          parentId: key,
          onClick: () => showMoreFolders(key),
          remaining: levelData.folders.length - levelData.visibleCount,
          subject
        });

        addMoreButtons.push(showMoreButtonNode);

        folderEdges.push(
          createBaseEdge({
            source: key,
            target: showMoreButtonNode.id,
            access: PermissionAccess.Partial
          })
        );
      }
    });

    const init = positionElements([roleNode, ...folderNodes, ...addMoreButtons], [...folderEdges]);
    setNodes(init.nodes);
    setEdges(init.edges);
  }, [
    levelFolderMap,
    permissions,
    environmentsFolders,
    environment,
    subject,
    secretName,
    setNodes,
    setEdges,
    metadata
  ]);

  return {
    nodes,
    edges,
    subject,
    environment,
    setEnvironment,
    isLoading: isPending,
    environments: currentWorkspace.environments,
    secretName,
    setSecretName,
    viewMode,
    setViewMode,
    levelFolderMap,
    showMoreFolders,
    levelsWithMoreFolders,
    getLevelCounts,
    totalFolderCount
  };
};
