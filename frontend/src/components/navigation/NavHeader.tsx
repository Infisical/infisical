import Link from "next/link";
import { useRouter } from "next/router";
import { faAngleRight, faLock } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";

import { useOrganization, useWorkspace } from "@app/context";

import { Select, SelectItem, Tooltip } from "../v2";

type Props = {
  pageName: string;
  isProjectRelated?: boolean;
  isOrganizationRelated?: boolean;
  currentEnv?: string;
  userAvailableEnvs?: any[];
  onEnvChange?: (slug: string) => void;
  secretPath?: string;
  isFolderMode?: boolean;
  isProtectedBranch?: boolean;
  protectionPolicyName?: string;
};

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
// TODO(akhilmhdh): simply this header and nav system later
export default function NavHeader({
  pageName,
  isProjectRelated,
  isOrganizationRelated,
  currentEnv,
  userAvailableEnvs = [],
  onEnvChange,
  isFolderMode,
  secretPath = "/",
  isProtectedBranch = false,
  protectionPolicyName
}: Props): JSX.Element {
  const { currentWorkspace } = useWorkspace();
  const { currentOrg } = useOrganization();
  const router = useRouter();

  const secretPathSegments = secretPath.split("/").filter(Boolean);

  return (
    <div className="flex flex-row items-center pt-6">
      <div className="mr-2 flex h-5 w-5 items-center justify-center rounded-md bg-primary text-sm text-black">
        {currentOrg?.name?.charAt(0)}
      </div>
      <Link passHref legacyBehavior href={`/org/${currentOrg?._id}/overview`}>
        <a className="pl-0.5 text-sm font-semibold text-primary/80 hover:text-primary">
          {currentOrg?.name}
        </a>
      </Link>
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
      {pageName === "Secrets" ? (
        <Link
          passHref
          legacyBehavior
          href={{ pathname: "/project/[id]/secrets/overview", query: { id: router.query.id } }}
        >
          <a className="text-sm font-semibold text-primary/80 hover:text-primary">{pageName}</a>
        </Link>
      ) : (
        <div className="text-sm text-gray-400">{pageName}</div>
      )}
      {currentEnv && secretPath === "/" && (
        <>
          <FontAwesomeIcon icon={faAngleRight} className="ml-3 mr-1.5 text-xs text-gray-400" />
          <div className="rounded-md pl-3 hover:bg-bunker-100/10">
            <Tooltip content="Select environment">
              <Select
                value={currentEnv}
                onValueChange={(value) => {
                  if (value && onEnvChange) onEnvChange(value);
                }}
                className="bg-transparent pl-0 text-sm font-medium text-primary/80 hover:text-primary"
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
        </>
      )}
      {isFolderMode && Boolean(secretPathSegments.length) && (
        <div className="flex items-center space-x-3">
          <FontAwesomeIcon icon={faAngleRight} className="ml-3 mr-1.5 text-xs text-gray-400" />
          <Link
            passHref
            legacyBehavior
            href={{
              pathname: "/project/[id]/secrets/v2/[env]",
              query: { id: router.query.id, env: router.query.env }
            }}
          >
            <a className="text-sm font-semibold text-primary/80 hover:text-primary">
              {userAvailableEnvs?.find(({ slug }) => slug === currentEnv)?.name}
            </a>
          </Link>
        </div>
      )}
      {isFolderMode &&
        secretPathSegments?.map((folderName, index) => {
          const query = { ...router.query };
          query.secretPath = `/${secretPathSegments.slice(0, index + 1).join("/")}`;

          return (
            <div
              className="flex items-center space-x-3"
              key={`breadcrumb-secret-path-${folderName}`}
            >
              <FontAwesomeIcon icon={faAngleRight} className="ml-3 mr-1.5 text-xs text-gray-400" />
              {index + 1 === secretPathSegments?.length ? (
                <span className="text-sm font-semibold text-bunker-300">{folderName}</span>
              ) : (
                <Link
                  passHref
                  legacyBehavior
                  href={{ pathname: "/project/[id]/secrets/[env]", query }}
                >
                  <a className="text-sm font-semibold text-primary/80 hover:text-primary">
                    {folderName}
                  </a>
                </Link>
              )}
            </div>
          );
        })}
      {isProtectedBranch && (
        <Tooltip content={`Protected by policy ${protectionPolicyName}`}>
          <FontAwesomeIcon icon={faLock} className="text-primary ml-2" />
        </Tooltip>
      )}
    </div>
  );
}
