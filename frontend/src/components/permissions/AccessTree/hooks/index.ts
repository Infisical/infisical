import { useEffect, useState } from "react";
import { MongoAbility, MongoQuery } from "@casl/ability";
import { Edge, Node, useEdgesState, useNodesState } from "@xyflow/react";

import { ProjectPermissionSub, useWorkspace } from "@app/context";
import { ProjectPermissionSet } from "@app/context/ProjectPermissionContext";
import { useListProjectEnvironmentsFolders } from "@app/hooks/api/secretFolders/queries";

import { useAccessTreeContext } from "../components";
import { PermissionAccess } from "../types";
import {
  createBaseEdge,
  createFolderNode,
  createRoleNode,
  getSubjectActionRuleMap,
  positionElements
} from "../utils";

export const useAccessTree = (permissions: MongoAbility<ProjectPermissionSet, MongoQuery>) => {
  const { currentWorkspace } = useWorkspace();
  const { secretName, setSecretName, setViewMode, viewMode } = useAccessTreeContext();
  const [nodes, setNodes] = useNodesState<Node>([]);
  const [edges, setEdges] = useEdgesState<Edge>([]);
  const [subject, setSubject] = useState(ProjectPermissionSub.Secrets);
  const [environment, setEnvironment] = useState(currentWorkspace.environments[0]?.slug ?? "");
  const { data: environmentsFolders, isPending } = useListProjectEnvironmentsFolders(
    currentWorkspace.id
  );

  useEffect(() => {
    if (!environmentsFolders || !permissions || !environmentsFolders[environment]) return;

    const { folders, name } = environmentsFolders[environment];

    const roleNode = createRoleNode({
      subject,
      environment: name
    });

    const actionRuleMap = getSubjectActionRuleMap(subject, permissions);

    const folderNodes = folders.map((folder) =>
      createFolderNode({
        folder,
        permissions,
        environment,
        subject,
        secretName,
        actionRuleMap
      })
    );

    const folderEdges = folderNodes.map(({ data: folder }) => {
      const actions = Object.values(folder.actions);

      let access: PermissionAccess;
      if (Object.values(actions).some((action) => action === PermissionAccess.Full)) {
        access = PermissionAccess.Full;
      } else if (Object.values(actions).some((action) => action === PermissionAccess.Partial)) {
        access = PermissionAccess.Partial;
      } else {
        access = PermissionAccess.None;
      }

      return createBaseEdge({
        source: folder.parentId ?? roleNode.id,
        target: folder.id,
        access
      });
    });

    const init = positionElements([roleNode, ...folderNodes], [...folderEdges]);
    setNodes(init.nodes);
    setEdges(init.edges);
  }, [permissions, environmentsFolders, environment, subject, secretName, setNodes, setEdges]);

  return {
    nodes,
    edges,
    subject,
    environment,
    setEnvironment,
    setSubject,
    isLoading: isPending,
    environments: currentWorkspace.environments,
    secretName,
    setSecretName,
    viewMode,
    setViewMode
  };
};
