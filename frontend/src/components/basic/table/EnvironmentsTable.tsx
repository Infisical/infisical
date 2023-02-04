import { useEffect, useState } from 'react';
import { faPencil, faPlus, faX } from '@fortawesome/free-solid-svg-icons';
import { plans } from 'public/data/frequentConstants';

import { usePopUp } from '../../../hooks/usePopUp';
import getOrganizationSubscriptions from '../../../pages/api/organization/GetOrgSubscription';
import Button from '../buttons/Button';
import { AddUpdateEnvironmentDialog } from '../dialog/AddUpdateEnvironmentDialog';
import DeleteActionModal from '../dialog/DeleteActionModal';
import UpgradePlanModal from '../dialog/UpgradePlan';

type Env = { name: string; slug: string };

type Props = {
  data: Env[];
  onCreateEnv: (arg0: Env) => Promise<void>;
  onUpdateEnv: (oldSlug: string, arg0: Env) => Promise<void>;
  onDeleteEnv: (slug: string) => Promise<void>;
};

const EnvironmentTable = ({ data = [], onCreateEnv, onDeleteEnv, onUpdateEnv }: Props) => {
  const { popUp, handlePopUpOpen, handlePopUpClose } = usePopUp([
    'createUpdateEnv',
    'deleteEnv',
    'upgradePlan'
  ] as const);
  const [plan, setPlan] = useState('');
  const host = window.location.origin;

  useEffect(() => {
    // on initial load - run auth check
    (async () => {
      const orgId = localStorage.getItem('orgData.id') as string;
      const subscriptions = await getOrganizationSubscriptions({
        orgId
      });
      if (subscriptions) {
        setPlan(subscriptions.data[0].plan.product)
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const onEnvCreateCB = async (env: Env) => {
    try {
      await onCreateEnv(env);
      handlePopUpClose('createUpdateEnv');
    } catch (error) {
      console.error(error);
    }
  };

  const onEnvUpdateCB = async (env: Env) => {
    try {
      await onUpdateEnv((popUp.createUpdateEnv?.data as Pick<Env, 'slug'>)?.slug, env);
      handlePopUpClose('createUpdateEnv');
    } catch (error) {
      console.error(error);
    }
  };

  const onEnvDeleteCB = async () => {
    try {
      await onDeleteEnv((popUp.deleteEnv?.data as Pick<Env, 'slug'>)?.slug);
      handlePopUpClose('deleteEnv');
    } catch (error) {
      console.error(error);
    }
  };

  return (
    <>
      <div className="flex w-full flex-row justify-between">
        <div className="flex w-full flex-col">
          <p className="mb-3 text-xl font-semibold">Project Environments</p>
          <p className="mb-4 text-base text-gray-400">
            Choose which environments will show up in your dashboard like development, staging,
            production
          </p>
          <p className="mr-1 self-start text-sm text-gray-500">
            Note: the text in slugs shows how these environmant should be accessed in CLI.
          </p>
        </div>
        <div className="w-48">
          <Button
            text="Add New Env"
            onButtonPressed={() => {
              if (plan !== plans.starter || host !== 'https://app.infisical.com') {
                handlePopUpOpen('createUpdateEnv');
              } else {
                handlePopUpOpen('upgradePlan');
              }
            }}
            color="mineshaft"
            icon={faPlus}
            size="md"
          />
        </div>
      </div>
      <div className="table-container relative mb-6 mt-1 w-full rounded-md border border-mineshaft-700 bg-bunker">
        <div className="absolute h-12 w-full rounded-t-md bg-white/5" />
        <table className="my-1 w-full">
          <thead className="text-bunker-300">
            <tr>
              <th className="pl-6 pt-2.5 pb-2 text-left">Name</th>
              <th className="pl-6 pt-2.5 pb-2 text-left">Slug</th>
              <th aria-label="buttons" />
            </tr>
          </thead>
          <tbody>
            {data?.length > 0 ? (
              data.map(({ name, slug }) => (
                <tr key={name} className="bg-bunker-800 duration-100 hover:bg-bunker-800/5">
                  <td className="border-t border-mineshaft-700 py-2 pl-6 text-gray-300">{name}</td>
                  <td className="border-t border-mineshaft-700 py-2 pl-6 text-gray-300">{slug}</td>
                  <td className="flex justify-end border-t border-mineshaft-700 py-2">
                    <div className="mr-2 flex items-center duration-200 hover:opacity-100">
                      <Button
                        onButtonPressed={() => {
                          if (plan !== plans.starter || host !== 'https://app.infisical.com') {
                            handlePopUpOpen('createUpdateEnv', { name, slug });
                          } else {
                            handlePopUpOpen('upgradePlan');
                          }
                        }}
                        color="mineshaft"
                        size="icon-sm"
                        icon={faPencil}
                      />
                    </div>
                    <div className="mr-6 flex items-center opacity-50 duration-200 hover:opacity-100">
                      <Button
                        onButtonPressed={() => {
                          if (plan !== plans.starter || host !== 'https://app.infisical.com') {
                            handlePopUpOpen('deleteEnv', { name, slug });
                          } else {
                            handlePopUpOpen('upgradePlan');
                          }
                        }}
                        color="red"
                        size="icon-sm"
                        icon={faX}
                      />
                    </div>
                  </td>
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan={4} className="pt-7 pb-4 text-center text-bunker-400">
                  No environments found
                </td>
              </tr>
            )}
          </tbody>
        </table>
        <DeleteActionModal
          isOpen={popUp.deleteEnv.isOpen}
          title={`Are you sure want to delete ${
            (popUp?.deleteEnv?.data as { name: string })?.name || ' '
          }?`}
          deleteKey={(popUp?.deleteEnv?.data as { slug: string })?.slug || ''}
          onClose={() => handlePopUpClose('deleteEnv')}
          onSubmit={onEnvDeleteCB}
        />
        <AddUpdateEnvironmentDialog
          isOpen={popUp.createUpdateEnv.isOpen}
          isEditMode={Boolean(popUp.createUpdateEnv?.data)}
          initialValues={popUp?.createUpdateEnv?.data as any}
          onClose={() => handlePopUpClose('createUpdateEnv')}
          onCreateSubmit={onEnvCreateCB}
          onEditSubmit={onEnvUpdateCB}
        />
        <UpgradePlanModal
          isOpen={popUp.upgradePlan.isOpen}
          onClose={() => handlePopUpClose('upgradePlan')}
          text="You can add custom environments if you switch to Infisical's Team plan."
        />
      </div>
    </>
  );
};

export default EnvironmentTable;
