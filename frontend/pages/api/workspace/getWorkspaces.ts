import SecurityClient from '~/utilities/SecurityClient';

interface Workspace {
  __v: number;
  _id: string;
  name: string;
  organization: string;
}

/**
 * This route lets us get the workspaces of a certain user
 * @returns
 */
const getWorkspaces = () => {
  return SecurityClient.fetchCall('/api/v1/workspace', {
    method: 'GET',
    headers: {
      'Content-Type': 'application/json'
    }
  }).then(async (res) => {
    if (res?.status == 200) {
      const data = (await res.json()) as unknown as { workspaces: Workspace[] };
      return data.workspaces;
    }

    throw new Error('Failed to get projects');
  });
};

export default getWorkspaces;
