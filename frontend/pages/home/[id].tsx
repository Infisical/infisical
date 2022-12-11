import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/router';
import { IconProp } from '@fortawesome/fontawesome-svg-core';
import { faSlack } from '@fortawesome/free-brands-svg-icons';
import {
  faCheckCircle,
  faHandPeace,
  faNetworkWired,
  faPlug,
  faPlus,
  faStar,
  faUserPlus
} from '@fortawesome/free-solid-svg-icons';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';

import onboardingCheck from '~/components/utilities/checks/OnboardingCheck';

import registerUserAction from '../api/userActions/registerUserAction';

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
      <Link href={link}>
        <a
          target={`${link.includes('https') ? '_blank' : '_self'}`}
          rel="noopener noreferrer"
          className="w-full"
        >
          <div
            onClick={async () => {
              if (userAction && userAction != 'first_time_secrets_pushed') {
                await registerUserAction({
                  action: userAction
                });
              }
            }}
            className="relative bg-bunker-700 hover:bg-bunker-500 shadow-xl duration-200 rounded-md border border-dashed border-bunker-400 pl-2 pr-6 py-2 h-[5.5rem] w-full flex items-center justify-between overflow-hidden my-1.5 cursor-pointer"
          >
            <div className="flex flex-row items-center mr-4">
              <FontAwesomeIcon icon={icon} className="text-4xl mx-2 w-16" />
              {complete && (
                <div className="bg-bunker-700 w-7 h-7 rounded-full absolute left-12 top-10 p-2 flex items-center justify-center">
                  <FontAwesomeIcon
                    icon={faCheckCircle}
                    className="text-4xl w-5 h-5 text-green"
                  />
                </div>
              )}
              <div className="flex flex-col items-start">
                <div className="text-xl font-semibold mt-0.5">{text}</div>
                <div className="text-sm font-normal">{subText}</div>
              </div>
            </div>
            <div
              className={`pr-4 font-semibold text-sm w-28 text-right ${
                complete && 'text-green'
              }`}
            >
              {complete ? 'Complete!' : 'About ' + time}
            </div>
            {complete && (
              <div className="absolute bottom-0 left-0 h-1 w-full bg-green"></div>
            )}
          </div>
        </a>
      </Link>
    );
  } else {
    return (
      <div
        onClick={async () => {
          if (userAction) {
            await registerUserAction({
              action: userAction
            });
          }
        }}
        className="relative bg-bunker-700 hover:bg-bunker-500 shadow-xl duration-200 rounded-md border border-dashed border-bunker-400 pl-2 pr-6 py-2 h-[5.5rem] w-full flex items-center justify-between overflow-hidden my-1.5 cursor-pointer"
      >
        <div className="flex flex-row items-center mr-4">
          <FontAwesomeIcon icon={icon} className="text-4xl mx-2 w-16" />
          {complete && (
            <div className="bg-bunker-700 w-7 h-7 rounded-full absolute left-11 top-10">
              <FontAwesomeIcon
                icon={faCheckCircle}
                className="absolute text-4xl left-12 top-16 w-5 h-5 text-green"
              />
            </div>
          )}
          <div className="flex flex-col items-start">
            <div className="text-xl font-semibold mt-0.5">{text}</div>
            <div className="text-sm font-normal mt-0.5">{subText}</div>
          </div>
        </div>
        <div
          className={`pr-4 font-semibold text-sm w-28 text-right ${
            complete && 'text-green'
          }`}
        >
          {complete ? 'Complete!' : 'About ' + time}
        </div>
        {complete && (
          <div className="absolute bottom-0 left-0 h-1 w-full bg-green"></div>
        )}
      </div>
    );
  }
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
    <div className="mx-6 lg:mx-0 w-full overflow-y-scroll pt-20 h-screen">
      <div className="flex flex-col items-center text-gray-300 text-lg mx-auto max-w-2xl lg:max-w-3xl xl:max-w-4xl py-6">
        <div className="text-3xl font-bold text-left w-full">
          Your quick start guide
        </div>
        <div className="text-md text-left w-full pt-2 pb-4 text-bunker-300">
          Click on the items below and follow the instructions.
        </div>
        {learningItem({
          text: 'Get to know Infisical',
          subText: '',
          complete: hasUserClickedIntro,
          icon: faHandPeace,
          time: '3 min',
          userAction: 'intro_cta_clicked',
          link: 'https://www.youtube.com/watch?v=JS3OKYU2078'
        })}
        {learningItem({
          text: 'Add your secrets',
          subText: 'Click to see example secrets, and add your own.',
          complete: hasUserPushedSecrets,
          icon: faPlus,
          time: '2 min',
          userAction: 'first_time_secrets_pushed',
          link: '/dashboard/' + router.query.id
        })}
        {learningItem({
          text: 'Inject secrets locally',
          subText:
            'Replace .env files with a more secure an efficient alternative.',
          complete: false,
          icon: faNetworkWired,
          time: '8 min',
          link: 'https://infisical.com/docs/getting-started/quickstart'
        })}
        {learningItem({
          text: 'Integrate Infisical with your infrastructure',
          subText:
            'Only a few integrations are currently available. Many more coming soon!',
          complete: false,
          icon: faPlug,
          time: '15 min',
          link: 'https://infisical.com/docs/integrations/overview'
        })}
        {learningItem({
          text: 'Invite your teammates',
          subText: '',
          complete: usersInOrg,
          icon: faUserPlus,
          time: '2 min',
          link: '/settings/org/' + router.query.id + '?invite'
        })}
        {learningItem({
          text: 'Join Infisical Slack',
          subText: 'Have any questions? Ask us!',
          complete: hasUserClickedSlack,
          icon: faSlack,
          time: '1 min',
          userAction: 'slack_cta_clicked',
          link: 'https://join.slack.com/t/infisical-users/shared_invite/zt-1kdbk07ro-RtoyEt_9E~fyzGo_xQYP6g'
        })}
        {learningItem({
          text: 'Star Infisical on GitHub',
          subText: "Like what we're doing? You know what to do! :)",
          complete: hasUserStarred,
          icon: faStar,
          time: '1 min',
          userAction: 'star_cta_clicked',
          link: 'https://github.com/Infisical/infisical'
        })}
      </div>
    </div>
  );
}

Home.requireAuth = true;
