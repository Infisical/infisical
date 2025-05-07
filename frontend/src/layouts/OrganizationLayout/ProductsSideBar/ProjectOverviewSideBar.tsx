import { faArrowUpRightFromSquare } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { Link, useMatchRoute } from "@tanstack/react-router";

import { Menu, MenuGroup, MenuItem } from "@app/components/v2";
import { ProjectType } from "@app/hooks/api/workspace/types";

type TProjectOverviewSideBarProps = {
  type: ProjectType;
};

export const ProjectOverviewSideBar = ({ type }: TProjectOverviewSideBarProps) => {
  const matchRoute = useMatchRoute();

  const isOverviewActive = !!matchRoute({
    to: `/organization/${type}/overview`,
    fuzzy: false
  });

  let label: string;
  let icon: string;
  let link: string;

  switch (type) {
    case ProjectType.CertificateManager:
      label = "Cert Management";
      icon = "note";
      link = "https://infisical.com/docs/documentation/platform/pki/overview";
      break;
    case ProjectType.SecretManager:
      label = "Secret Management";
      icon = "sliding-carousel";
      link = "https://infisical.com/docs/documentation/getting-started/introduction";
      break;
    case ProjectType.KMS:
      label = "KMS";
      icon = "unlock";
      link = "https://infisical.com/docs/documentation/platform/kms/overview";
      break;
    case ProjectType.SSH:
      label = "SSH";
      icon = "verified";
      link = "https://infisical.com/docs/documentation/platform/ssh/overview";
      break;
    default:
      throw new Error("Unknown project type");
  }

  return (
    <>
      <div className="p-2 pt-3">
        <a
          target="_blank"
          rel="noopener noreferrer"
          href={link}
          className="flex w-full items-center rounded-md border border-mineshaft-600 p-2 pl-3 transition-all duration-150 hover:bg-mineshaft-700"
        >
          <div className="mr-2 flex h-6 w-6 items-center justify-center rounded-md bg-mineshaft-500 p-4">
            <FontAwesomeIcon
              icon={faArrowUpRightFromSquare}
              className="h-3.5 w-3.5 text-mineshaft-300"
            />
          </div>
          <div className="-mt-1 flex flex-grow flex-col text-white">
            <div className="max-w-36 truncate text-ellipsis text-sm font-medium capitalize">
              Infisical Docs
            </div>
            <div className="text-xs leading-[10px] text-mineshaft-400">
              {type === ProjectType.SecretManager ? "Get Started" : `${label} Overview`}
            </div>
          </div>
        </a>
      </div>
      <Menu>
        <MenuGroup title="Overview">
          <Link to={`/organization/${type}/overview`}>
            <MenuItem isSelected={isOverviewActive} icon={icon}>
              {label}
            </MenuItem>
          </Link>
        </MenuGroup>
        <MenuGroup title="Other">
          <Link to={`/organization/${type}/settings`}>
            {({ isActive }) => (
              <MenuItem isSelected={isActive} icon="toggle-settings">
                Settings
              </MenuItem>
            )}
          </Link>
        </MenuGroup>
      </Menu>
    </>
  );
};
