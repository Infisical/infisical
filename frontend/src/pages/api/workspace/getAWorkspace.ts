import SecurityClient from '@app/components/utilities/SecurityClient';

interface Workspace {
  __v: number;
  _id: string;
  name: string;
  organization: string;
  environments: Array<{ name: string; slug: string }>;
}

/**
 * This route lets us get the workspaces of a certain user
 * @returns
 */
const getAWorkspace = (workspaceID: string) =>
  SecurityClient.fetchCall(`/api/v1/workspace/${workspaceID}`, {
    method: 'GET',
    headers: {
      'Content-Type': 'application/json'
    }
  }).then(async (res) => {
    if (res?.status === 200) {
      const data = (await res.json()) as unknown as { workspace: Workspace };
      return data.workspace;
    }

    throw new Error('Failed to get workspace');
  });

export default getAWorkspace;
