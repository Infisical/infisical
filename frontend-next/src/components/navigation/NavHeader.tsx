import { ParsedUrlQuery } from "querystring";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/router";
import { faAngleRight, faCheck, faCopy, faLock } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { twMerge } from "tailwind-merge";

import { useOrganization, useWorkspace } from "@app/context";
import { useToggle } from "@app/hooks";
import { ProjectType } from "@app/hooks/api/workspace/types";

import { createNotification } from "../notifications";
import { IconButton, Select, SelectItem, Tooltip } from "../v2";

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

  const [isCopied, { timedToggle: toggleIsCopied }] = useToggle(false);
  const [isHoveringCopyButton, setIsHoveringCopyButton] = useState(false);

  const router = useRouter();

  const secretPathSegments = secretPath.split("/").filter(Boolean);

  return (
    <div className="flex flex-row items-center pt-6">
      <div className="mr-2 flex h-5 w-5 min-w-[1.25rem] items-center justify-center rounded-md bg-primary text-sm text-black">
        {currentOrg?.name?.charAt(0)}
      </div>
      <Link
        passHref
        legacyBehavior
        href={`/org/${currentOrg?.id}/${ProjectType.SecretManager}/overview`}
      >
        <a className="truncate pl-0.5 text-sm font-semibold text-primary/80 hover:text-primary">
          {currentOrg?.name}
        </a>
      </Link>
      {isProjectRelated && (
        <>
          <FontAwesomeIcon icon={faAngleRight} className="ml-3 mr-3 text-xs text-gray-400" />
          <div className="truncate text-sm font-semibold text-bunker-300">
            {currentWorkspace?.name}
          </div>
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
          href={{
            pathname: `/${ProjectType.SecretManager}/[id]/secrets/overview`,
            query: { id: router.query.id }
          }}
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
                className="border-none bg-transparent pl-0 text-sm font-medium text-primary/80 hover:text-primary"
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
              pathname: `/${ProjectType.SecretManager}/[id]/secrets/[env]`,
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
          const query: ParsedUrlQuery & { secretPath: string } = {
            ...router.query,
            secretPath: `/${secretPathSegments.slice(0, index + 1).join("/")}`
          };

          return (
            <div
              className="flex items-center space-x-3"
              key={`breadcrumb-secret-path-${folderName}`}
            >
              <FontAwesomeIcon icon={faAngleRight} className="ml-3 mr-1.5 text-xs text-gray-400" />
              {index + 1 === secretPathSegments?.length ? (
                <div className="flex items-center space-x-2">
                  <span
                    className={twMerge(
                      "text-sm font-semibold transition-all",
                      isHoveringCopyButton ? "text-bunker-200" : "text-bunker-300"
                    )}
                  >
                    {folderName}
                  </span>
                  <Tooltip
                    className="relative right-2"
                    position="bottom"
                    content="Copy secret path"
                  >
                    <IconButton
                      variant="plain"
                      ariaLabel="copy"
                      onMouseEnter={() => setIsHoveringCopyButton(true)}
                      onMouseLeave={() => setIsHoveringCopyButton(false)}
                      onClick={() => {
                        if (isCopied) return;

                        navigator.clipboard.writeText(query.secretPath);

                        createNotification({
                          text: "Copied secret path to clipboard",
                          type: "info"
                        });

                        toggleIsCopied(2000);
                      }}
                      className="hover:bg-bunker-100/10"
                    >
                      <FontAwesomeIcon
                        icon={!isCopied ? faCopy : faCheck}
                        size="sm"
                        className="cursor-pointer"
                      />
                    </IconButton>
                  </Tooltip>
                </div>
              ) : (
                <Link
                  passHref
                  legacyBehavior
                  href={{
                    pathname: `/${ProjectType.SecretManager}/[id]/secrets/[env]`,
                    query
                  }}
                >
                  <a
                    className={twMerge(
                      "text-sm font-semibold transition-all hover:text-primary",
                      isHoveringCopyButton ? "text-primary" : "text-primary/80"
                    )}
                  >
                    {folderName}
                  </a>
                </Link>
              )}
            </div>
          );
        })}
      {isProtectedBranch && (
        <Tooltip content={`Protected by policy ${protectionPolicyName}`}>
          <FontAwesomeIcon icon={faLock} className="ml-2 text-primary" />
        </Tooltip>
      )}
    </div>
  );
}
