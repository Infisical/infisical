import React, { useState } from 'react'
import { useTranslation } from 'react-i18next';

import Button from '../basic/buttons/Button';
import { DeleteEnvVar } from '../basic/dialog/DeleteEnvVar';

type Props = {
  onSubmit: () => void
}

export const DeleteActionButton = ({ onSubmit }: Props) => {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false)

  return (
    <div className="bg-[#9B3535] opacity-70 hover:opacity-100 w-[4.5rem] h-[2.5rem] rounded-md duration-200 ml-2">
      <Button
        text={String(t("Delete"))}
        // onButtonPressed={onSubmit}
        color="red"
        size="md"
        onButtonPressed={() => setOpen(true)}
      />
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
