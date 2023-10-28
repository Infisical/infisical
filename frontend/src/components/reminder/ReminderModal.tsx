import { useEffect, useState } from "react";
import { Controller, useForm } from "react-hook-form";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import get from "lodash/get";
import map from "lodash/map";
import { faPencil, faTrash } from "@fortawesome/free-solid-svg-icons";
import {
  Button,
  FormControl,
  Input,
  Modal,
  ModalClose,
  ModalContent,
  TextArea,
} from "@app/components/v2";
import { useGetSecretReminders, useCreateSecretReminders, useDeleteSecretReminders, useUpdateSecretReminders } from "@app/hooks/api";
import { Spinner } from "@app/components/v2";

type Props = {
  isOpen?: boolean;
  onToggle: (isOpen: boolean) => void;
  secretID: string | undefined
};

const defaultValues = {
  frequency: "",
  note: ""
};

const reminderSchema = z.object({
  frequency: z.string().trim(),
  note: z.string().trim()
});

type FormData = z.infer<typeof reminderSchema>;

type TTableRowProps = {
  frequency: number;
  note: string;
  onClickEdit: () => void;
  onClickDelete: () => void;
}

const TableRow = ({ frequency, note, onClickEdit, onClickDelete }: TTableRowProps) => {
  return (
    <div className="flex font-medium border-b border-mineshaft-600">
      <div className="border-r border-mineshaft-600 px-4 py-2 w-20">{frequency}</div>
      <div className="flex-grow px-4 py-2 border-r border-mineshaft-600">{note}</div>
      <div className="px-4 py-2 w-20">
        <FontAwesomeIcon icon={faPencil} style={{ marginRight: '15px', cursor: 'pointer' }} onClick={onClickEdit} />
        <FontAwesomeIcon icon={faTrash} style={{ cursor: 'pointer' }} onClick={onClickDelete}/>
      </div>
    </div>
  )
}

type TTableViewProps = {
  isOpen?: boolean;
  onToggle: (isOpen: boolean) => void;
  reminders: any;
  onClickEdit: (reminderID: string) => void;
  onClickDelete: (reminderID: string) => void;
}

const TableView = ({ isOpen, onToggle, reminders, onClickEdit, onClickDelete }: TTableViewProps) => {
  return (
    <Modal isOpen={isOpen} onOpenChange={onToggle}>
      <ModalContent
        title="Secret Reminders"
        subTitle="Specify the frequency of the reminder and the note."
      >
        <div className="flex font-medium border-b border-mineshaft-600">
          <div className="border-r border-mineshaft-600 px-4 py-2 w-20">Key</div>
          <div className="flex-grow px-4 py-2 border-r border-mineshaft-600">Value</div>
          <div className="px-4 py-2 w-20">Value</div>
        </div>

        {map(reminders, ({ _id , frequency, note }) => (
          <TableRow
            note={note}
            frequency={frequency}
            onClickEdit={() => onClickEdit(_id)}
            onClickDelete={() => onClickDelete(_id)}
          />
        ))}

      </ModalContent>
    </Modal>
  )
}

export const ReminderModal = ({ isOpen, onToggle, secretID }: Props): JSX.Element => {
  const {
    register,
    control,
    reset,
    watch,
    setValue,
    formState: { isSubmitting },
    handleSubmit
  } = useForm<FormData>({
    defaultValues: defaultValues,
    resolver: zodResolver(reminderSchema)
  });

  const [isEditView, setIsEditView] = useState(false)

  const { mutateAsync: createSecretReminder } = useCreateSecretReminders();
  const { mutateAsync: updateSecretReminder } = useUpdateSecretReminders();
  const { mutateAsync: deleteSecretReminder } = useDeleteSecretReminders();

  // const { mutateAsync, isLoading } = useGetOrgTrialUrl();

  const { data, isLoading } = useGetSecretReminders(secretID || "");
  // for v1 we assume only one reminder per secret is supported
  // in the future we can explore if more than one reminder per secret makes sense
  const reminder = get(data, 0);
  const note = get(reminder, "note");
  const frequency = get(reminder, "frequency");


  const resetState = () => {
    reset();
    setIsEditView(false);
  }

  useEffect(() => {
    if (isOpen && frequency && note) {
      setValue("frequency", frequency + '');
      setValue("note", note);
    } else {
      resetState();
    }
  }, [isOpen, frequency, note]);

  const onFormSubmit = async ({ frequency, note }: FormData) => {
    if (isEditView) {
      await updateSecretReminder({
        secretID,
        reminderID: reminder?._id,
        note,
        frequency: parseInt(frequency)
      })
    } else {
      await createSecretReminder({
        secretID,
        note,
        frequency: parseInt(frequency)
      })
    }

    onToggle(false);
    resetState();
  };

  const deleteReminder = (reminderID: string) => {
    deleteSecretReminder({ secretID, reminderID })
    onToggle(false)
  }

  if (isLoading) {
    return (
      <Modal isOpen={isOpen} onOpenChange={onToggle}>
        <ModalContent
          title="Secret Reminders"
          subTitle="Specify the frequency of the reminder and the note."
        >
          <Spinner />
        </ModalContent>
      </Modal>
    )
  }

  if (data?.length && !isEditView) {
    return (
      <TableView
        isOpen={isOpen}
        onToggle={onToggle}
        reminders={data}
        onClickEdit={() => setIsEditView(true)}
        onClickDelete={deleteReminder}
      />
    )
  }

  return (
    <Modal isOpen={isOpen} onOpenChange={onToggle}>
      <ModalContent
        title="Secret Reminders"
        subTitle="Specify the frequency of the reminder and the note."
      >
        <form onSubmit={handleSubmit(onFormSubmit)}>

          <Controller
            control={control}
            name="frequency"
            defaultValue=""
            render={({ field, fieldState: { error } }) => (
              <FormControl label="Days" isError={Boolean(error)} errorText={error?.message} isRequired={true}>
                <Input {...field} type="number" min="1" placeholder="Every # of days" />
              </FormControl>
            )}
          />

            <FormControl label="Note" isRequired={true}>
              <TextArea
                className="border border-mineshaft-600 text-sm"
                {...register("note")}
                readOnly={false}
                rows={5}
              />
            </FormControl>

          <div className="mt-8 flex items-center">
            <Button
              className="mr-4"
              type="submit"
              isDisabled={isSubmitting}
              isLoading={isSubmitting}
            >
              Save
            </Button>
            <ModalClose asChild>
              <Button variant="plain" colorSchema="secondary">
                Cancel
              </Button>
            </ModalClose>
          </div>
        </form>
      </ModalContent>
    </Modal>
  );
};