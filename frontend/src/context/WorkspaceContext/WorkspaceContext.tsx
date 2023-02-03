import { createContext, ReactNode, useContext, useEffect, useMemo } from 'react';
import { useRouter } from 'next/router';

import { useGetUserWorkspaces } from '@app/hooks/api';
import { Workspace } from '@app/hooks/api/workspace/types';

type TWorkspaceContext = {
  workspaces: Workspace[];
  currentWorkspace?: Workspace;
  isLoading: boolean;
};

const WorkspaceContext = createContext<TWorkspaceContext | null>(null);

type Props = {
  children: ReactNode;
};

export const WorkspaceProvider = ({ children }: Props): JSX.Element => {
  const { data: ws, isLoading } = useGetUserWorkspaces();
  const router = useRouter();
  const workspaceId = router.query.id;

  // memorize the workspace details for the context
  const value = useMemo<TWorkspaceContext>(() => {
    return {
      workspaces: ws || [],
      currentWorkspace: (ws || []).find(({ _id: id }) => id === workspaceId),
      isLoading
    };
  }, [ws, workspaceId, isLoading]);

  useEffect(() => {
    // not loading and current workspace is empty
    // ws empty means user has no access to the ws
    // push to the first workspace
    if (!isLoading && !value?.currentWorkspace?._id) {
      router.push(`/dashboard/${value.workspaces?.[0]?._id}`);
    }
  }, [value?.currentWorkspace?._id, isLoading, value.workspaces?.[0]?._id, router.pathname]);

  return <WorkspaceContext.Provider value={value}>{children}</WorkspaceContext.Provider>;
};

export const useWorkspace = () => {
  const ctx = useContext(WorkspaceContext);
  if (!ctx) {
    throw new Error('useWorkspace has to be used within <WorkspaceContext.Provider>');
  }

  return ctx;
};
