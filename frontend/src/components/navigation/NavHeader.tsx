import { useEffect, useState } from 'react';
import { useRouter } from 'next/router';
import { faAngleRight } from '@fortawesome/free-solid-svg-icons';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';

import { useWorkspace } from '@app/context';
import getOrganization from '@app/pages/api/organization/GetOrg';

/**
 * This is the component at the top of almost every page.
 * It shows how to navigate to a certain page.
 * It future these links should also be clickable and hoverable
 * @param obj
 * @param obj.pageName - Name of the page
 * @param obj.isProjectRelated - whether this page is related to project or now (determine if it's 2 or 3 navigation steps)
 * @returns
 */
export default function NavHeader({
  pageName,
  isProjectRelated
}: {
  pageName: string;
  isProjectRelated?: boolean;
}): JSX.Element {
  const [orgName, setOrgName] = useState('');
  const router = useRouter();
  const projectId = String(router.query.id);
  const { currentWorkspace } = useWorkspace();

  useEffect(() => {
    (async () => {
      const orgId = localStorage.getItem('orgData.id');
      const org = await getOrganization({
        orgId: orgId || ''
      });
      setOrgName(org.name);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId]);

  return (
    <div className="ml-6 flex flex-row items-center pt-8">
      <div className="mr-2 flex h-6 w-6 items-center justify-center rounded-md bg-primary-900 text-mineshaft-100">
        {orgName?.charAt(0)}
      </div>
      <div className="text-sm font-semibold text-primary">{orgName}</div>
      {isProjectRelated && (
        <>
          <FontAwesomeIcon icon={faAngleRight} className="ml-3 mr-3 text-sm text-gray-400" />
          <div className="text-sm font-semibold text-primary">{currentWorkspace?.name}</div>
        </>
      )}
      <FontAwesomeIcon icon={faAngleRight} className="ml-3 mr-3 text-sm text-gray-400" />
      <div className="text-sm text-gray-400">{pageName}</div>
    </div>
  );
}
