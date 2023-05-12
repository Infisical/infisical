import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import Head from 'next/head';
import { plans as plansConstant } from 'public/data/frequentConstants';

import Plan from '@app/components/billing/Plan';
import NavHeader from '@app/components/navigation/NavHeader';

import getOrganizationSubscriptions from '../../api/organization/GetOrgSubscription';
import getOrganizationUsers from '../../api/organization/GetOrgUsers';

export default function SettingsBilling() {
  const [currentPlan, setCurrentPlan] = useState('');
  const [numUsers, setNumUsers] = useState(0);

  const { t } = useTranslation();

  const plans = [
    {
      key: 1,
      name: t('billing.starter.name')!,
      price: t('billing.free')!,
      priceExplanation: t('billing.starter.price-explanation')!,
      text: t('billing.starter.text')!,
      subtext: t('billing.starter.subtext')!,
      buttonTextMain: t('billing.downgrade')!,
      buttonTextSecondary: t('billing.learn-more')!,
      current: currentPlan === plansConstant.starter
    },
    {
      key: 2,
      name: 'Team',
      price: '$8',
      priceExplanation: t('billing.professional.price-explanation')!,
      text: 'For teams that want to improve their efficiency and security.',
      buttonTextMain: t('billing.upgrade')!,
      buttonTextSecondary: t('billing.learn-more')!,
      current: currentPlan === plansConstant.team
    },
    {
      key: 3,
      name: t('billing.professional.name')!,
      price: '$18',
      priceExplanation: t('billing.professional.price-explanation')!,
      text: t('billing.enterprise.text')!,
      subtext: t('billing.professional.subtext')!,
      buttonTextMain: t('billing.upgrade')!,
      buttonTextSecondary: t('billing.learn-more')!,
      current: currentPlan === plansConstant.professional
    },
    {
      key: 4,
      name: t('billing.enterprise.name')!,
      price: t('billing.custom-pricing')!,
      text: 'Boost the security and efficiency of your engineering teams.',
      buttonTextMain: t('billing.schedule-demo')!,
      buttonTextSecondary: t('billing.learn-more')!,
      current: false
    }
  ];

  useEffect(() => {
    (async () => {
      const orgId = localStorage.getItem('orgData.id') as string;
      const subscriptions = await getOrganizationSubscriptions({
        orgId
      });
      if (subscriptions) {
        setCurrentPlan(subscriptions.data[0].plan.product);
      }
      const orgUsers = await getOrganizationUsers({
        orgId
      });
      setNumUsers(orgUsers.length);
    })();
  }, []);

  return (
    <div className="flex flex-col justify-between bg-bunker-800 pb-4 text-white">
      <Head>
        <title>{t('common.head-title', { title: t('billing.title') })}</title>
        <link rel="icon" href="/infisical.ico" />
      </Head>
      <div className="flex flex-row">
        <div className="w-full pb-2">
          <NavHeader pageName={t('billing.title')} />
          <div className="my-8 ml-6 flex max-w-5xl flex-row items-center justify-between text-xl">
            <div className="flex flex-col items-start justify-start text-3xl">
              <p className="mr-4 font-semibold text-gray-200">{t('billing.title')}</p>
              <p className="mr-4 text-base font-normal text-gray-400">{t('billing.description')}</p>
            </div>
          </div>
          <div className="ml-6 flex w-max flex-col text-mineshaft-50">
            <p className="text-xl font-semibold">{t('billing.subscription')}</p>
            <div className="mt-4 grid grid-cols-2 grid-rows-2 gap-y-6 gap-x-3 overflow-x-auto">
              {plans.map((plan) => (
                <Plan key={plan.name} plan={plan} />
              ))}
            </div>
            <p className="mt-12 text-xl font-bold">{t('billing.current-usage')}</p>
            <div className="flex flex-row">
              <div className="mr-4 mt-8 flex w-60 flex-col items-center justify-center rounded-md bg-white/5 pt-6 pb-10 text-gray-300">
                <p className="text-6xl font-bold">{numUsers}</p>
                <p className="text-gray-300">
                  {numUsers > 1 ? 'Organization members' : 'Organization member'}
                </p>
              </div>
              {/* <div className="mr-4 mt-8 text-gray-300 w-60 pt-6 pb-10 rounded-md bg-white/5 flex justify-center items-center flex flex-col">
									<p className="text-6xl font-bold">1 </p>
									<p className="text-gray-300">Organization projects</p>
								</div> */}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

SettingsBilling.requireAuth = true;
