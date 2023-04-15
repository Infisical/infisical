import { useRouter } from 'next/router';
import { faAngleRight } from '@fortawesome/free-solid-svg-icons';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';

import { useOrganization, useWorkspace } from '@app/context';

import { Select, SelectItem, Tooltip } from '../v2';

// TODO: make links clickable and clean up

/**
 * This is the component at the top of almost every page.
 * It shows how to navigate to a certain page.
 * It future these links should also be clickable and hoverable
 * @param {object} obj
 * @param {string} obj.pageName - Name of the page
 * @param {boolean} obj.isProjectRelated - whether or not this page is related to project (determine if it's 2 or 3 navigation steps)
 * @param {boolean} obj.isOrganizationRelated - whether or not this page is related to organization (determine if it's 2 or 3 navigation steps)
 * @param {string} obj.currentEnv - current environment inside a project
 * @param {string} obj.userAvailableEnvs - environments that are available to a user in this project (used for the dropdown)
 * @param {string} obj.onEnvChange - the action that happens when an env is changed
 * @returns
 */
export default function NavHeader({
  pageName,
  isProjectRelated,
  isOrganizationRelated,
  currentEnv,
  userAvailableEnvs,
  onEnvChange
}: {
  pageName: string;
  isProjectRelated?: boolean;
  isOrganizationRelated?: boolean;
  currentEnv?: string;
  userAvailableEnvs?: any[];
  onEnvChange?: (slug: string) => void;
}): JSX.Element {
  const { currentWorkspace } = useWorkspace();
  const { currentOrg } = useOrganization();
  const router = useRouter()

  return (
    <div className="ml-6 flex flex-row items-center pt-8">
      <div className="mr-2 flex h-6 w-6 items-center justify-center rounded-md bg-primary-900 text-mineshaft-100">
        {currentOrg?.name?.charAt(0)}
      </div>
      <div className="text-sm font-semibold text-bunker-300">{currentOrg?.name}</div>
      {isProjectRelated && (
        <>
          <FontAwesomeIcon icon={faAngleRight} className="ml-3 mr-3 text-xs text-gray-400" />
          <div className="text-sm font-semibold text-bunker-300">{currentWorkspace?.name}</div>
        </>
      )}
      {isOrganizationRelated && (
        <>
          <FontAwesomeIcon icon={faAngleRight} className="ml-3 mr-3 text-xs text-gray-400" />
          <div className="text-sm font-semibold text-bunker-300">Organization Settings</div>
        </>
      )}
      <FontAwesomeIcon icon={faAngleRight} className="ml-3 mr-3 text-sm text-gray-400" />
      {pageName === 'Secrets'
      ? <a className="text-sm font-semibold text-primary/80 hover:text-primary" href={`${router.asPath.split("?")[0]}`}>{pageName}</a>
      : <div className="text-sm text-gray-400">{pageName}</div>}
      {currentEnv &&
      <>
        <FontAwesomeIcon icon={faAngleRight} className="ml-3 mr-1.5 text-xs text-gray-400" />
        <div className='pl-3 rounded-md hover:bg-bunker-100/10'>
          <Tooltip content="Select environment">
            <Select
              value={userAvailableEnvs?.filter(uae => uae.name === currentEnv)[0]?.slug}
              onValueChange={(value) => {
                if (value && onEnvChange) onEnvChange(value);
              }}
              className="text-sm pl-0 font-medium text-primary/80 hover:text-primary bg-transparent"
              dropdownContainerClassName="text-bunker-200 bg-mineshaft-800 border border-mineshaft-600 drop-shadow-2xl"
            >
              {userAvailableEnvs?.map(({ name, slug }) => (
                <SelectItem value={slug} key={slug}>
                  {name}
                </SelectItem>
              ))}
            </Select>
          </Tooltip>
        </div>
      </>}
    </div>
  );
}
