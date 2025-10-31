import { useForm } from "react-hook-form";
import { faRocketchat } from "@fortawesome/free-brands-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";

import { createNotification } from "@app/components/notifications";
import {
  Button,
  FormControl,
  Popover,
  PopoverContent,
  PopoverTrigger,
  TextArea
} from "@app/components/v2";
import { useToggle } from "@app/hooks";
import { useCreateUserWish } from "@app/hooks/api/userEngagement";

const formSchema = z.object({
  text: z.string().trim().min(1)
});

type TFormData = z.infer<typeof formSchema>;

export const WishForm = () => {
  const {
    handleSubmit,
    register,
    reset,
    formState: { isSubmitting, errors }
  } = useForm<TFormData>({
    resolver: zodResolver(formSchema)
  });
  const { mutateAsync } = useCreateUserWish();
  const [isOpen, setIsOpen] = useToggle(false);

  const createWish = async (data: TFormData) => {
    await mutateAsync({
      text: data.text
    });

    createNotification({
      text: "Your wish has been sent to the Infisical team!",
      type: "success"
    });

    setIsOpen.off();
  };

  return (
    <Popover
      onOpenChange={() => {
        setIsOpen.toggle();
        reset();
      }}
      open={isOpen}
    >
      <PopoverTrigger asChild>
        <div className="mb-3 w-full cursor-pointer pl-5 text-sm whitespace-nowrap text-mineshaft-400 duration-200 hover:text-mineshaft-200">
          <FontAwesomeIcon icon={faRocketchat} className="mr-2" />
          Request a feature
        </div>
      </PopoverTrigger>
      <PopoverContent
        hideCloseBtn
        align="end"
        alignOffset={20}
        className="mb-1 w-auto border border-mineshaft-600 bg-mineshaft-900 p-4 drop-shadow-2xl"
        sticky="always"
      >
        <form onSubmit={handleSubmit(createWish)}>
          <FormControl
            className="mb-0"
            isError={Boolean(errors?.text)}
            errorText={errors?.text?.message}
          >
            <TextArea
              className="border border-mineshaft-600 bg-black/10 text-sm focus:ring-0"
              variant="outline"
              placeholder="Wish for anything! Help us improve the platform."
              reSize="none"
              rows={6}
              cols={40}
              {...register("text")}
            />
          </FormControl>
          <div className="flex justify-end pt-2">
            <Button
              className="w-min"
              colorSchema="secondary"
              type="submit"
              isLoading={isSubmitting}
              disabled={isSubmitting}
            >
              Send
            </Button>
          </div>
        </form>
      </PopoverContent>
    </Popover>
  );
};
