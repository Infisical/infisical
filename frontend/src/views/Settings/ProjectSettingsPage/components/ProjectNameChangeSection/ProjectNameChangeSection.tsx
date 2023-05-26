import { useEffect } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { faCheck } from '@fortawesome/free-solid-svg-icons';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { yupResolver } from '@hookform/resolvers/yup';
import * as yup from 'yup';

import { Button, FormControl, Input } from '@app/components/v2';

type Props = {
  workspaceName?: string;
  onProjectNameChange: (name: string) => Promise<void>;
};

const formSchema = yup.object({
  name: yup.string().required().label('Project Name')
});

type FormData = yup.InferType<typeof formSchema>;

export const ProjectNameChangeSection = ({
  workspaceName,
  onProjectNameChange
}: Props): JSX.Element => {
  const {
    handleSubmit,
    control,
    reset,
    formState: { isDirty, isSubmitting }
  } = useForm<FormData>({ resolver: yupResolver(formSchema) });
  const { t } = useTranslation();

  useEffect(() => {
    reset({ name: workspaceName });
  }, [workspaceName]);

  const onFormSubmit = async ({ name }: FormData) => {
    await onProjectNameChange(name);
  };

  return (
    <form onSubmit={handleSubmit(onFormSubmit)}>
      <div className="mb-6 flex w-full flex-col items-start rounded-md bg-white/5 px-6 pb-6 pt-3">
        <p className="mb-4 mt-2 text-xl font-semibold">{t('common.display-name')}</p>
        <div className="mb-2 w-full max-w-lg">
          <Controller
            defaultValue=""
            render={({ field, fieldState: { error } }) => (
              <FormControl isError={Boolean(error)} errorText={error?.message}>
                <Input placeholder="Type your project name" {...field} />
              </FormControl>
            )}
            control={control}
            name="name"
          />
        </div>
        <Button
          isLoading={isSubmitting}
          color="mineshaft"
          size="sm"
          type="submit"
          isDisabled={!isDirty || isSubmitting}
          leftIcon={<FontAwesomeIcon icon={faCheck} />}
        >
          {t('common.save-changes')}
        </Button>
      </div>
    </form>
  );
};
