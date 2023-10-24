import { useForm } from "react-hook-form";
import { faClock } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { zodResolver } from "@hookform/resolvers/zod";
import { isValidCron } from "cron-validator";
import cronstrue from "cronstrue";
import { z } from "zod";

import { Button, FormControl, Input, Modal, ModalContent, TextArea } from "@app/components/v2";

const ReminderFormSchema = z.object({
  note: z.string().optional(),
  cron: z.string().refine(isValidCron, { message: "Invalid cron expression" })
});

export type TReminderFormSchema = z.infer<typeof ReminderFormSchema>;

interface ReminderFormProps {
  isOpen: boolean;
  onOpenChange: (isOpen: boolean, data?: TReminderFormSchema) => void;
}

export const CreateReminderForm = ({ isOpen, onOpenChange }: ReminderFormProps) => {
  const {
    register,
    watch,
    handleSubmit,
    formState: { errors, isSubmitting }
  } = useForm<TReminderFormSchema>({ resolver: zodResolver(ReminderFormSchema) });

  const cronWatch = watch("cron");

  const handleFormSubmit = async (data: TReminderFormSchema) => {
    onOpenChange(false, data);
  };

  return (
    <Modal isOpen={isOpen} onOpenChange={onOpenChange}>
      <ModalContent
        title="Create secret reminder"
        // ? QUESTION: Should this specifically say its for secret rotation?
        // ? Or should we be call it something more generic?
        subTitle={
          <div>
            Set up a reminder for when this secret should be rotated. Everyone in the workspace will
            be notified when the reminder is triggered.
            <div className="mt-1">
              {/* eslint-disable-next-line react/jsx-no-target-blank */}
              <a target="_blank" href="https://crontab.guru/every-month">
                <span className="cursor-pointer text-primary-400 hover:text-primary-500">
                  Learn more about cron expressions
                </span>
              </a>
            </div>
          </div>
        }
      >
        <form onSubmit={handleSubmit(handleFormSubmit)}>
          <div className="space-y-4">
            <div>
              <FormControl
                className="mb-0"
                label="How often"
                isError={Boolean(errors?.cron)}
                errorText={errors?.cron?.message}
              >
                <Input {...register("cron")} placeholder="0 0 1 * *" />
              </FormControl>
              {!!cronWatch && isValidCron(cronWatch) && (
                <div className="mt-2 ml-1 text-xs opacity-60">{cronstrue.toString(cronWatch)}</div>
              )}
            </div>

            <FormControl label="Note" className="mb-0">
              <TextArea
                placeholder="Remember to rotate the AWS secret every month."
                className="border border-mineshaft-600 text-sm"
                rows={8}
                reSize="none"
                cols={30}
                {...register("note")}
              />
            </FormControl>
          </div>
          <div className="mt-7 flex items-center">
            <Button
              isDisabled={isSubmitting}
              isLoading={isSubmitting}
              key="layout-create-project-submit"
              className="mr-4"
              leftIcon={<FontAwesomeIcon icon={faClock} />}
              type="submit"
            >
              Create reminder
            </Button>
            <Button
              key="layout-cancel-create-project"
              onClick={() => onOpenChange(false)}
              variant="plain"
              colorSchema="secondary"
            >
              Cancel
            </Button>
          </div>
        </form>
      </ModalContent>
    </Modal>
  );
};
