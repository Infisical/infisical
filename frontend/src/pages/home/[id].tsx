import { useEffect, useState } from 'react';
import Head from 'next/head';
import Image from 'next/image';
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

import onboardingCheck from '@app/components/utilities/checks/OnboardingCheck';
import { getTranslatedServerSideProps } from '@app/components/utilities/withTranslateProps';
import { TabsObject } from '@app/components/v2/Tabs';

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
      <a
        target={`${link.includes('https') ? '_blank' : '_self'}`}
        rel="noopener noreferrer"
        className={`w-full ${complete && 'opacity-30 hover:opacity-100 duration-200'}`}
        href={link}
      >
        <div
          onKeyDown={() => null}
          role="button"
          tabIndex={0}
          onClick={async () => {
            if (userAction && userAction !== 'first_time_secrets_pushed') {
              await registerUserAction({
                action: userAction
              });
            }
          }}
          className="relative group bg-bunker-500 hover:bg-mineshaft-700 shadow-xl duration-200 rounded-md border border-mineshaft-600 pl-2 pr-6 py-2 h-[5.5rem] w-full flex items-center justify-between overflow-hidden mb-3 cursor-pointer"
        >
          <div className="flex flex-row items-center mr-4">
            <FontAwesomeIcon icon={icon} className="text-4xl mx-2 w-16" />
            {complete && (
              <div className="bg-bunker-500 group-hover:bg-mineshaft-700 w-7 h-7 rounded-full absolute left-12 top-10 p-2 flex items-center justify-center">
                <FontAwesomeIcon icon={faCheckCircle} className="text-4xl w-5 h-5 text-primary" />
              </div>
            )}
            <div className="flex flex-col items-start">
              <div className="text-xl font-semibold mt-0.5">{text}</div>
              <div className="text-sm font-normal">{subText}</div>
            </div>
          </div>
          <div
            className={`pr-4 font-semibold text-sm w-28 text-right ${complete && 'text-primary'}`}
          >
            {complete ? 'Complete!' : `About ${time}`}
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
      className="relative bg-bunker-700 hover:bg-bunker-500 shadow-xl duration-200 rounded-md border border-dashed border-bunker-400 pl-2 pr-6 py-2 h-[5.5rem] w-full flex items-center justify-between overflow-hidden my-1.5 cursor-pointer"
    >
      <div className="flex flex-row items-center mr-4">
        <FontAwesomeIcon icon={icon} className="text-4xl mx-2 w-16" />
        {complete && (
          <div className="bg-bunker-700 w-7 h-7 rounded-full absolute left-11 top-10">
            <FontAwesomeIcon
              icon={faCheckCircle}
              className="absolute text-4xl left-12 top-16 w-5 h-5 text-primary"
            />
          </div>
        )}
        <div className="flex flex-col items-start">
          <div className="text-xl font-semibold mt-0.5">{text}</div>
          <div className="text-sm font-normal mt-0.5">{subText}</div>
        </div>
      </div>
      <div className={`pr-4 font-semibold text-sm w-28 text-right ${complete && 'text-primary'}`}>
        {complete ? 'Complete!' : `About ${time}`}
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
    <div className="mx-6 lg:mx-0 w-full pt-4">
      <Head>
        <title>Infisical Guide</title>
        <link rel="icon" href="/infisical.ico" />
      </Head>
      <div className="flex relative flex-col items-center text-gray-300 text-lg mx-auto px-6 max-w-3xl lg:max-w-4xl xl:max-w-5xl py-6">
        <div className="text-5xl font-bold text-left w-full mt-12">Your quick start guide</div>
        <div className="text-lg text-left w-full pt-2 pb-4 mb-14 text-bunker-300">
          Click on the items below and follow the instructions.
        </div>
        <div className='absolute h-min top-0 right-0 hidden lg:block'><Image src="/images/dragon-book.svg" height={250} width={400} alt="start guise dragon illustration" /></div>
        {learningItem({
          text: 'Get to know Infisical',
          subText: '',
          complete: hasUserClickedIntro,
          icon: faHandPeace,
          time: '3 min',
          userAction: 'intro_cta_clicked',
          link: 'https://www.youtube.com/watch?v=3F7FNYX94zA'
        })}
        {learningItem({
          text: 'Add your secrets',
          subText: 'Click to see example secrets, and add your own.',
          complete: hasUserPushedSecrets,
          icon: faPlus,
          time: '2 min',
          userAction: 'first_time_secrets_pushed',
          link: `/dashboard/${router.query.id}`
        })}
        <div className="relative group bg-bunker-500 shadow-xl duration-200 rounded-md border border-mineshaft-600 pl-2 pr-2 pt-4 pb-2 h-full w-full flex flex-col items-center justify-between overflow-hidden mb-3 cursor-default">
          <div className='w-full flex flex-row items-center mb-4 pr-4'>
            <div className="flex flex-row items-center mr-4 w-full">
              <FontAwesomeIcon icon={faNetworkWired} className="text-4xl mx-2 w-16" />
              {false && (
                <div className="bg-bunker-500 group-hover:bg-mineshaft-700 w-7 h-7 rounded-full absolute left-12 top-10 p-2 flex items-center justify-center">
                  <FontAwesomeIcon icon={faCheckCircle} className="text-4xl w-5 h-5 text-green" />
                </div>
              )}
              <div className="flex pl-0.5 flex-col items-start">
                <div className="text-xl font-semibold mt-0.5">Inject secrets locally</div>
                <div className="text-sm font-normal">Replace .env files with a more secure and efficient alternative.</div>
              </div>
            </div>
            <div
              className={`pr-4 font-semibold text-sm w-28 text-right ${false && 'text-green'}`}
            >
              About 2 min
            </div>
          </div>
          <TabsObject/>
          {false && <div className="absolute bottom-0 left-0 h-1 w-full bg-green" />}
        </div>
        {learningItem({
          text: 'Integrate Infisical with your infrastructure',
          subText: 'Connect Infisical to various 3rd party services and platforms.',
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
          link: `/settings/org/${router.query.id}?invite`
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

export const getServerSideProps = getTranslatedServerSideProps(['home']);
