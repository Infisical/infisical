import { faAngleRight } from '@fortawesome/free-solid-svg-icons';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';

import { useOrganization, useWorkspace } from '@app/context';

// TODO: make links clickable and clean up

/**
 * This is the component at the top of almost every page.
 * It shows how to navigate to a certain page.
 * It future these links should also be clickable and hoverable
 * @param obj
 * @param obj.pageName - Name of the page
 * @param obj.isProjectRelated - whether or not this page is related to project (determine if it's 2 or 3 navigation steps)
 * @param obj.isOrganizationRelated - whether or not this page is related to organization (determine if it's 2 or 3 navigation steps)
 * @returns
 */
export default function NavHeader({
  pageName,
  isProjectRelated,
  isOrganizationRelated
}: {
  pageName: string;
  isProjectRelated?: boolean;
  isOrganizationRelated?: boolean;
}): JSX.Element {
  const { currentWorkspace } = useWorkspace();
  const { currentOrg } = useOrganization();

  return (
    <div className="ml-6 flex flex-row items-center pt-8">
      <div className="mr-2 flex h-6 w-6 items-center justify-center rounded-md bg-primary-900 text-mineshaft-100">
        {currentOrg?.name?.charAt(0)}
      </div>
      <div className="text-sm font-semibold text-primary">{currentOrg?.name}</div>
      {isProjectRelated && (
        <>
          <FontAwesomeIcon icon={faAngleRight} className="ml-3 mr-3 text-sm text-gray-400" />
          <div className="text-sm font-semibold text-primary">{currentWorkspace?.name}</div>
        </>
      )}
      {isOrganizationRelated && (
        <>
          <FontAwesomeIcon icon={faAngleRight} className="ml-3 mr-3 text-sm text-gray-400" />
          <div className="text-sm font-semibold text-primary">Organization Settings</div>
        </>
      )}
      <FontAwesomeIcon icon={faAngleRight} className="ml-3 mr-3 text-sm text-gray-400" />
      <div className="text-sm text-gray-400">{pageName}</div>
    </div>
  );
}
