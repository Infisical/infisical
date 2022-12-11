import React from 'react';

import StripeRedirect from '~/pages/api/organization/StripeRedirect';

import { tempLocalStorage } from '../utilities/checks/tempLocalStorage';

interface Props {
  plan: {
    name: string;
    price: string;
    priceExplanation: string;
    text: string;
    subtext: string;
    buttonTextMain: string;
    buttonTextSecondary: string;
    current: boolean;
  };
}

export default function Plan({ plan }: Props) {
  return (
    <div
      className={`relative flex flex-col justify-between border-2 min-w-fit w-96 rounded-lg h-68 mr-4 bg-mineshaft-800 ${
        plan.name != 'Starter' && plan.current == true
          ? 'border-primary'
          : 'border-chicago-700'
      }
			`}
    >
      <div className="flex flex-col">
        <div className="flex flex-row justify-between items-center relative z-10">
          <p className={`px-6 py-4 text-3xl font-semibold text-gray-400`}>
            {plan.name}
          </p>
        </div>
        <div className="flex flwx-row items-end justify-start mb-4">
          <p className="pl-6 text-3xl font-semibold text-primary">
            {plan.price}
          </p>
          <p className="pl-3 mb-1 text-lg text-gray-400">
            {plan.priceExplanation}
          </p>
        </div>
        <p className="relative z-10 max-w-fit px-6 text-base text-gray-400">
          {plan.text}
        </p>
        <p className="relative z-10 max-w-fit px-6 text-base text-gray-400">
          {plan.subtext}
        </p>
      </div>
      <div className="flex flex-row items-center">
        {plan.current == false ? (
          <>
            {plan.buttonTextMain == 'Schedule a Demo' ? (
              <a href="/scheduledemo" target='_blank rel="noopener"'>
                <div className="relative z-10 mx-5 mt-3 mb-4 py-2 px-4 border border-1 border-gray-600 hover:text-black hover:border-primary text-gray-400 font-semibold hover:bg-primary bg-bunker duration-200 cursor-pointer rounded-md flex w-max">
                  {plan.buttonTextMain}
                </div>
              </a>
            ) : (
              <div
                className={`relative z-10 mx-5 mt-3 mb-4 py-2 px-4 border border-1 border-gray-600 text-gray-400 font-semibold ${
                  plan.buttonTextMain == 'Downgrade'
                    ? 'hover:bg-red hover:text-white hover:border-red'
                    : 'hover:bg-primary hover:text-black hover:border-primary'
                } bg-bunker duration-200 cursor-pointer rounded-md flex w-max`}
              >
                <button
                  onClick={() =>
                    StripeRedirect({
                      orgId: tempLocalStorage('orgData.id')
                    })
                  }
                >
                  {plan.buttonTextMain}
                </button>
              </div>
            )}
            <a
              href="https://infisical.com/pricing"
              target='_blank rel="noopener"'
            >
              <div className="relative z-10 text-gray-400 font-semibold hover:text-primary duration-200 cursor-pointer mb-0.5">
                {plan.buttonTextSecondary}
              </div>
            </a>
          </>
        ) : (
          <div
            className={`h-8 w-full rounded-b-md flex justify-center items-center z-10 ${
              plan.name != 'Starter' && plan.current == true
                ? 'bg-primary'
                : 'bg-chicago-700'
            }`}
          >
            <p className="text-xs text-black font-semibold">CURRENT PLAN</p>
          </div>
        )}
      </div>
    </div>
  );
}
