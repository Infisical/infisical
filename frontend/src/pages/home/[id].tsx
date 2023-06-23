import { useEffect, useState } from "react";
import Head from "next/head";
import Image from "next/image";
import { useRouter } from "next/router";
import { IconProp } from "@fortawesome/fontawesome-svg-core";
import { faSlack } from "@fortawesome/free-brands-svg-icons";
import {
  faCheckCircle,
  faHandPeace,
  faNetworkWired,
  faPlug,
  faPlus,
  faStar,
  faUserPlus
} from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";

import onboardingCheck from "@app/components/utilities/checks/OnboardingCheck";
import { TabsObject } from "@app/components/v2/Tabs";

import registerUserAction from "../api/userActions/registerUserAction";

type ItemProps = {
  text: string;
  subText: string;
  complete: boolean;
  icon: IconProp;
  time: string;
  userAction?: string;
  link?: string;
};

const learningItem = ({
  text,
  subText,
  complete,
  icon,
  time,
  userAction,
  link
}: ItemProps): JSX.Element => {
  if (link) {
    return (
      <a
        target={`${link.includes("https") ? "_blank" : "_self"}`}
        rel="noopener noreferrer"
        className={`w-full ${complete && "opacity-30 duration-200 hover:opacity-100"}`}
        href={link}
      >
        <div
          onKeyDown={() => null}
          role="button"
          tabIndex={0}
          onClick={async () => {
            if (userAction && userAction !== "first_time_secrets_pushed") {
              await registerUserAction({
                action: userAction
              });
            }
          }}
          className="group relative mb-3 flex h-[5.5rem] w-full cursor-pointer items-center justify-between overflow-hidden rounded-md border border-mineshaft-600 bg-bunker-500 py-2 pl-2 pr-6 shadow-xl duration-200 hover:bg-mineshaft-700"
        >
          <div className="mr-4 flex flex-row items-center">
            <FontAwesomeIcon icon={icon} className="mx-2 w-16 text-4xl" />
            {complete && (
              <div className="absolute left-12 top-10 flex h-7 w-7 items-center justify-center rounded-full bg-bunker-500 p-2 group-hover:bg-mineshaft-700">
                <FontAwesomeIcon icon={faCheckCircle} className="h-5 w-5 text-4xl text-primary" />
              </div>
            )}
            <div className="flex flex-col items-start">
              <div className="mt-0.5 text-xl font-semibold">{text}</div>
              <div className="text-sm font-normal">{subText}</div>
            </div>
          </div>
          <div
            className={`w-28 pr-4 text-right text-sm font-semibold ${complete && "text-primary"}`}
          >
            {complete ? "Complete!" : `About ${time}`}
          </div>
          {complete && <div className="absolute bottom-0 left-0 h-1 w-full bg-primary" />}
        </div>
      </a>
    );
  }
  return (
    <div
      onKeyDown={() => null}
      role="button"
      tabIndex={0}
      onClick={async () => {
        if (userAction) {
          await registerUserAction({
            action: userAction
          });
        }
      }}
      className="relative my-1.5 flex h-[5.5rem] w-full cursor-pointer items-center justify-between overflow-hidden rounded-md border border-dashed border-bunker-400 bg-bunker-700 py-2 pl-2 pr-6 shadow-xl duration-200 hover:bg-bunker-500"
    >
      <div className="mr-4 flex flex-row items-center">
        <FontAwesomeIcon icon={icon} className="mx-2 w-16 text-4xl" />
        {complete && (
          <div className="absolute left-11 top-10 h-7 w-7 rounded-full bg-bunker-700">
            <FontAwesomeIcon
              icon={faCheckCircle}
              className="absolute left-12 top-16 h-5 w-5 text-4xl text-primary"
            />
          </div>
        )}
        <div className="flex flex-col items-start">
          <div className="mt-0.5 text-xl font-semibold">{text}</div>
          <div className="mt-0.5 text-sm font-normal">{subText}</div>
        </div>
      </div>
      <div className={`w-28 pr-4 text-right text-sm font-semibold ${complete && "text-primary"}`}>
        {complete ? "Complete!" : `About ${time}`}
      </div>
      {complete && <div className="absolute bottom-0 left-0 h-1 w-full bg-primary" />}
    </div>
  );
};

/**
 * This tab is called Home because in the future it will include some company news,
 * updates, roadmap, relavant blogs, etc. Currently it only has the setup instruction
 * for the new users
 */
export default function Home() {
  const router = useRouter();
  const [hasUserClickedSlack, setHasUserClickedSlack] = useState(false);
  const [hasUserClickedIntro, setHasUserClickedIntro] = useState(false);
  const [hasUserStarred, setHasUserStarred] = useState(false);
  const [hasUserPushedSecrets, setHasUserPushedSecrets] = useState(false);
  const [usersInOrg, setUsersInOrg] = useState(false);

  useEffect(() => {
    onboardingCheck({
      setHasUserClickedIntro,
      setHasUserClickedSlack,
      setHasUserPushedSecrets,
      setHasUserStarred,
      setUsersInOrg
    });
  }, []);

  return (
    <div className="mx-6 w-full pt-4 lg:mx-0">
      <Head>
        <title>Infisical Guide</title>
        <link rel="icon" href="/infisical.ico" />
      </Head>
      <div className="relative mx-auto flex max-w-3xl flex-col items-center px-6 py-6 text-lg text-gray-300 lg:max-w-4xl xl:max-w-5xl">
        <div className="mt-12 w-full text-left text-5xl font-bold">Your quick start guide</div>
        <div className="mb-14 w-full pt-2 pb-4 text-left text-lg text-bunker-300">
          Click on the items below and follow the instructions.
        </div>
        <div className="absolute top-0 right-0 hidden h-min lg:block">
          <Image
            src="/images/dragon-book.svg"
            height={250}
            width={400}
            alt="start guise dragon illustration"
          />
        </div>
        {learningItem({
          text: "Get to know Infisical",
          subText: "",
          complete: hasUserClickedIntro,
          icon: faHandPeace,
          time: "3 min",
          userAction: "intro_cta_clicked",
          link: "https://www.youtube.com/watch?v=PK23097-25I"
        })}
        {learningItem({
          text: "Add your secrets",
          subText: "Click to see example secrets, and add your own.",
          complete: hasUserPushedSecrets,
          icon: faPlus,
          time: "2 min",
          userAction: "first_time_secrets_pushed",
          link: `/dashboard/${router.query.id}`
        })}
        <div className="group relative mb-3 flex h-full w-full cursor-default flex-col items-center justify-between overflow-hidden rounded-md border border-mineshaft-600 bg-bunker-500 pl-2 pr-2 pt-4 pb-2 shadow-xl duration-200">
          <div className="mb-4 flex w-full flex-row items-center pr-4">
            <div className="mr-4 flex w-full flex-row items-center">
              <FontAwesomeIcon icon={faNetworkWired} className="mx-2 w-16 text-4xl" />
              {false && (
                <div className="absolute left-12 top-10 flex h-7 w-7 items-center justify-center rounded-full bg-bunker-500 p-2 group-hover:bg-mineshaft-700">
                  <FontAwesomeIcon icon={faCheckCircle} className="h-5 w-5 text-4xl text-green" />
                </div>
              )}
              <div className="flex flex-col items-start pl-0.5">
                <div className="mt-0.5 text-xl font-semibold">Inject secrets locally</div>
                <div className="text-sm font-normal">
                  Replace .env files with a more secure and efficient alternative.
                </div>
              </div>
            </div>
            <div className={`w-28 pr-4 text-right text-sm font-semibold ${false && "text-green"}`}>
              About 2 min
            </div>
          </div>
          <TabsObject />
          {false && <div className="absolute bottom-0 left-0 h-1 w-full bg-green" />}
        </div>
        {learningItem({
          text: "Integrate Infisical with your infrastructure",
          subText: "Connect Infisical to various 3rd party services and platforms.",
          complete: false,
          icon: faPlug,
          time: "15 min",
          link: "https://infisical.com/docs/integrations/overview"
        })}
        {learningItem({
          text: "Invite your teammates",
          subText: "",
          complete: usersInOrg,
          icon: faUserPlus,
          time: "2 min",
          link: `/settings/org/${router.query.id}?invite`
        })}
        {learningItem({
          text: "Join Infisical Slack",
          subText: "Have any questions? Ask us!",
          complete: hasUserClickedSlack,
          icon: faSlack,
          time: "1 min",
          userAction: "slack_cta_clicked",
          link: "https://join.slack.com/t/infisical-users/shared_invite/zt-1wehzfnzn-1aMo5JcGENJiNAC2SD8Jlg"
        })}
        {learningItem({
          text: "Star Infisical on GitHub",
          subText: "Like what we're doing? You know what to do! :)",
          complete: hasUserStarred,
          icon: faStar,
          time: "1 min",
          userAction: "star_cta_clicked",
          link: "https://github.com/Infisical/infisical"
        })}
      </div>
    </div>
  );
}

Home.requireAuth = true;
