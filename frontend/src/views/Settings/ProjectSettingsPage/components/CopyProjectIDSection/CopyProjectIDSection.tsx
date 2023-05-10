import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { faCheck, faCopy } from '@fortawesome/free-solid-svg-icons';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';

import { IconButton } from '@app/components/v2';
import { useToggle } from '@app/hooks';

type Props = {
  workspaceID: string;
};

export const CopyProjectIDSection = ({ workspaceID }: Props): JSX.Element => {
  const { t } = useTranslation();
  const [isProjectIdCopied, setIsProjectIdCopied] = useToggle(false);

  useEffect(() => {
    let timer: NodeJS.Timeout;
    if (isProjectIdCopied) {
      timer = setTimeout(() => setIsProjectIdCopied.off(), 2000);
    }
    return () => clearTimeout(timer);
  }, [isProjectIdCopied]);

  const copyProjectIdToClipboard = () => {
    navigator.clipboard.writeText(workspaceID);
    setIsProjectIdCopied.on();
  };

  return (
    <div className="mb-6 mt-4 flex w-full flex-col items-start rounded-md bg-white/5 px-6 pt-4 pb-2">
      <p className="self-start text-xl font-semibold">{t('common.project-id')}</p>
      <p className="mt-4 self-start text-base font-normal text-gray-400">
        {t('settings.project.project-id-description')}
      </p>
      <p className="mt-2 self-start text-base font-normal text-gray-400">
        {t('settings.project.project-id-description2')}
        {/* eslint-disable-next-line react/jsx-no-target-blank */}
        <a
          href="https://infisical.com/docs/documentation/getting-started/introduction"
          target="_blank"
          rel="noopener"
          className="text-primary duration-200 hover:opacity-80"
        >
          {t('settings.project.docs')}
        </a>
      </p>
      <p className="mt-4 text-xs text-bunker-300">{t('settings.project.auto-generated')}</p>
      <div className="mt-2 mb-3 mr-2 flex items-center justify-end rounded-md bg-white/[0.07] text-base text-gray-400">
        <p className="mr-2 pl-4 font-bold">{`${t('common.project-id')}:`}</p>
        <p className="mr-4">{workspaceID}</p>
        <IconButton
          ariaLabel="copy icon"
          colorSchema="secondary"
          className="group relative"
          onClick={() => copyProjectIdToClipboard()}
        >
          <FontAwesomeIcon icon={isProjectIdCopied ? faCheck : faCopy} />
          <span className="absolute -left-8 -top-20 hidden w-28 translate-y-full rounded-md bg-bunker-800 py-2 pl-3 text-center text-sm text-gray-400 group-hover:flex group-hover:animate-fadeIn">
            {t('common.click-to-copy')}
          </span>
        </IconButton>
      </div>
    </div>
  );
};
