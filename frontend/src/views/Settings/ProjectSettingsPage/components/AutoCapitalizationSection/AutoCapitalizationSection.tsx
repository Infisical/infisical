import { useTranslation } from 'react-i18next';

import { Checkbox } from '@app/components/v2';

type Props = {
  workspaceAutoCapitalization?: boolean;
  onAutoCapitalizationChange: (state: boolean) => Promise<void>;
};

export const AutoCapitalizationSection = ({
  workspaceAutoCapitalization,
  onAutoCapitalizationChange
}: Props) => {
  const { t } = useTranslation();
  return (
    <div className="mb-6 mt-4 flex w-full flex-col items-start rounded-md bg-mineshaft-900 px-6 pb-6 pt-2">
      <p className="mb-4 mt-2 text-xl font-semibold">{t('settings.project.auto-capitalization')}</p>
      <Checkbox
        className="data-[state=checked]:bg-primary"
        id="autoCapitalization"
        isChecked={workspaceAutoCapitalization}
        onCheckedChange={(state) => {
          onAutoCapitalizationChange(state as boolean);
        }}
      >
        {t('settings.project.auto-capitalization-description')}
      </Checkbox>
    </div>
  );
};
