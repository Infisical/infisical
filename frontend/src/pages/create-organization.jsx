import { apiRequest } from '@app/config/request';
import { useEffect, useState } from 'react';
import getOrganizations from '@app/pages/api/organization/getOrgs';
import { initProjectHelper } from '@app/helpers/project';

const CreateOrganization = () => {
  const [organization, setOrganization] = useState('');
  const [projectName, setProjectName] = useState('');

  useEffect(() => {
    async function fetchOrganizations() {
      const organizations = await getOrganizations();
      console.log(organizations);
    }

    fetchOrganizations();
  }, []);

  const createOrganizationHandler = async () => {
    const org = await apiRequest.post('/api/v1/organization', {
      organizationName: organization
    });

    console.log(org);
  };

  const createWorkspaceHandler = async () => {
    const organizationId = '63cefb15c8d3175601cfa985';
    const project = initProjectHelper({
      organizationId,
      projectName
    });
    console.log(project);
  };

  return (
    <div className="mt-40 flex justify-center gap-4">
      <input
        text="text"
        className="border-2 border-stone-900 px-2 py-1"
        placeholder="create organization"
        onChange={(e) => setOrganization(e.target.value)}
        value={organization}
      />

      <button className="border-2 border-black px-2 py-1" onClick={createOrganizationHandler}>
        Create
      </button>
      <input
        text="text"
        className="mx-5 border-2 border-stone-900 px-2 py-1"
        placeholder="create workspace"
        onChange={(e) => setProjectName(e.target.value)}
        value={projectName}
      />

      <button className="border-2 border-black px-2 py-1" onClick={createWorkspaceHandler}>
        Create
      </button>
    </div>
  );
};

export default CreateOrganization;
