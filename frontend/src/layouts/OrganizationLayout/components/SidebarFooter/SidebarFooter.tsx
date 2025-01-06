import { faGithub, faSlack } from "@fortawesome/free-brands-svg-icons";
import {
  faBook,
  faEnvelope,
  faInfinity,
  faInfo,
  faPlus,
  faQuestion
} from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { Link } from "@tanstack/react-router";

import { WishForm } from "@app/components/features/WishForm";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger
} from "@app/components/v2";
import { envConfig } from "@app/config/env";
import { useOrganization, useSubscription } from "@app/context";
import { useGetOrgTrialUrl } from "@app/hooks/api";

export const INFISICAL_SUPPORT_OPTIONS = [
  [
    <FontAwesomeIcon key={1} className="pr-4 text-sm" icon={faSlack} />,
    "Support Forum",
    "https://infisical.com/slack"
  ],
  [
    <FontAwesomeIcon key={2} className="pr-4 text-sm" icon={faBook} />,
    "Read Docs",
    "https://infisical.com/docs/documentation/getting-started/introduction"
  ],
  [
    <FontAwesomeIcon key={3} className="pr-4 text-sm" icon={faGithub} />,
    "GitHub Issues",
    "https://github.com/Infisical/infisical/issues"
  ],
  [
    <FontAwesomeIcon key={4} className="pr-4 text-sm" icon={faEnvelope} />,
    "Email Support",
    "mailto:support@infisical.com"
  ]
];

export const SidebarFooter = () => {
  const { subscription } = useSubscription();
  const { currentOrg } = useOrganization();

  const { mutateAsync } = useGetOrgTrialUrl();

  return (
    <div
      className={`relative mt-10 ${
        subscription && subscription.slug === "starter" && !subscription.has_used_trial
          ? "mb-2"
          : "mb-4"
      } flex w-full cursor-default flex-col items-center px-3 text-sm text-mineshaft-400`}
    >
      {(window.location.origin.includes("https://app.infisical.com") ||
        window.location.origin.includes("https://gamma.infisical.com")) && <WishForm />}
      <Link
        to="/organization/access-management"
        search={{
          action: "invite"
        }}
        className="w-full"
      >
        <div className="mb-3 w-full pl-5 duration-200 hover:text-mineshaft-200">
          <FontAwesomeIcon icon={faPlus} className="mr-3" />
          Invite people
        </div>
      </Link>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <div className="mb-2 w-full pl-5 duration-200 hover:text-mineshaft-200">
            <FontAwesomeIcon icon={faQuestion} className="mr-3 px-[0.1rem]" />
            Help & Support
          </div>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="p-1">
          {INFISICAL_SUPPORT_OPTIONS.map(([icon, text, url]) => (
            <DropdownMenuItem key={url as string}>
              <a
                target="_blank"
                rel="noopener noreferrer"
                href={String(url)}
                className="flex w-full items-center rounded-md font-normal text-mineshaft-300 duration-200"
              >
                <div className="relative flex w-full cursor-pointer select-none items-center justify-start rounded-md">
                  {icon}
                  <div className="text-sm">{text}</div>
                </div>
              </a>
            </DropdownMenuItem>
          ))}
          {envConfig.PLATFORM_VERSION && (
            <div className="mb-2 mt-2 w-full cursor-default pl-5 text-sm duration-200 hover:text-mineshaft-200">
              <FontAwesomeIcon icon={faInfo} className="mr-4 px-[0.1rem]" />
              Version: {envConfig.PLATFORM_VERSION}
            </div>
          )}
        </DropdownMenuContent>
      </DropdownMenu>
      {subscription && subscription.slug === "starter" && !subscription.has_used_trial && (
        <button
          type="button"
          onClick={async () => {
            if (!subscription || !currentOrg) return;

            // direct user to start pro trial
            const url = await mutateAsync({
              orgId: currentOrg.id,
              success_url: window.location.href
            });

            window.location.href = url;
          }}
          className="mt-1.5 w-full"
        >
          <div className="justify-left mb-1.5 mt-1.5 flex w-full items-center rounded-md bg-mineshaft-600 py-1 pl-4 text-mineshaft-300 duration-200 hover:bg-mineshaft-500 hover:text-primary-400">
            <FontAwesomeIcon icon={faInfinity} className="ml-0.5 mr-3 py-2 text-primary" />
            Start Free Pro Trial
          </div>
        </button>
      )}
    </div>
  );
};
