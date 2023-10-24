import { useForm } from "react-hook-form";
import { faClock } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { zodResolver } from "@hookform/resolvers/zod";
import { isValidCron } from "cron-validator";
import cronstrue from "cronstrue";
import { z } from "zod";

import { Button, FormControl, Input, Modal, ModalContent, TextArea } from "@app/components/v2";

interface ReminderFormProps {
  isOpen: boolean;
  onClose: (data?: {cron: string, note?: string}) => void;
}


const ReminderFormSchema = z.object({
  note: z.string().optional(),
  cron: z.string().refine(isValidCron, {message: "Invalid cron expression"})
});

type TReminderFormSchema = z.infer<typeof ReminderFormSchema>;

export const CreateReminderForm = ({isOpen, onClose}: ReminderFormProps) => {

  const {
    register,
    watch,
    handleSubmit,
    formState: { errors, isSubmitting }
  } = useForm<TReminderFormSchema>({ resolver: zodResolver(ReminderFormSchema) });

  const cronWatch = watch("cron");


  const handleFormSubmit = async (data: TReminderFormSchema) => {
    return onClose(data);
  }

  return (
    <Modal
      isOpen={isOpen}
      onOpenChange={(state) =>  !state && onClose()}
    >
      <ModalContent

        title="Create secret reminder"
        // ? QUESTION: Should this specifically say its for secret rotation?
        // ? Or should we be call it something more generic?
        subTitle={
          <div>
            Set up a reminder for when this secret should be rotated.
            <div>
                Format is in{" "}
                {/* eslint-disable-next-line react/jsx-no-target-blank */}
                <a target='_blank' href="https://crontab.guru/every-month">
                  <span className="text-primary-400 hover:text-primary-500 cursor-pointer">
                    cron format.
                  </span>
                </a>
            </div>
          </div>
        }
      >
        <form onSubmit={handleSubmit(handleFormSubmit)}>
          <div className="space-y-4">
            <div>
              <FormControl className="mb-0" label="How often" isError={Boolean(errors?.cron)} errorText={errors?.cron?.message}>
                <Input
                  {...register("cron")}
                  placeholder="0 0 1 * *"
                  />
              </FormControl>
              {!!cronWatch && isValidCron(cronWatch) && (
                <div className="text-xs opacity-60 mt-2 ml-1">{cronstrue.toString(cronWatch)}</div>
                )}
            </div>

            <FormControl label="Note" className="mb-0">
              <TextArea
                placeholder="Remember to rotate the AWS secret every month."
                className="border border-mineshaft-600 text-sm"
                rows={8}
                reSize='none'
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
              leftIcon={<FontAwesomeIcon icon={faClock}/>}
              type="submit"
            >
              Create reminder
            </Button>
            <Button
              key="layout-cancel-create-project"
              onClick={() => onClose()}
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
}