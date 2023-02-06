import React, { useState } from 'react'
import { useTranslation } from 'react-i18next';
import { faXmark } from '@fortawesome/free-solid-svg-icons';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';

import Button from '../basic/buttons/Button';
import { DeleteEnvVar } from '../basic/dialog/DeleteEnvVar';

type Props = {
  onSubmit: () => void;
  isPlain?: boolean;
}

export const DeleteActionButton = ({ onSubmit, isPlain }: Props) => {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false)

  return (
    <div className={`${
      !isPlain 
      ? 'bg-[#9B3535] opacity-70 hover:opacity-100 w-[4.5rem] h-[2.5rem] rounded-md duration-200 ml-2'
      : 'cursor-pointer w-[2.35rem] h-[2.35rem] flex items-center justfy-center'}`}>
      {isPlain 
      ? <div
        onKeyDown={() => null}
        role="button"
        tabIndex={0}
        onClick={() => setOpen(true)}
        className="invisible group-hover:visible"
      >
        <FontAwesomeIcon className="text-bunker-300 hover:text-red pl-2 pr-6 text-lg mt-0.5" icon={faXmark} />
      </div>
      : <Button
        text={String(t("Delete"))}
        // onButtonPressed={onSubmit}
        color="red"
        size="md"
        onButtonPressed={() => setOpen(true)}
      />}
      <DeleteEnvVar 
        isOpen={open}
        onClose={() => {
          setOpen(false)
        }}
        onSubmit={onSubmit}
      />
    </div>
  )
}
