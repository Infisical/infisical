import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { MessageCircleIcon } from "lucide-react";
import { z } from "zod";

import { createNotification } from "@app/components/notifications";
import {
  Button,
  Field,
  FieldError,
  FieldLabel,
  Popover,
  PopoverContent,
  PopoverTrigger,
  TextArea
} from "@app/components/v3";
import { useToggle } from "@app/hooks";
import { useCreateUserWish } from "@app/hooks/api/userEngagement";

const formSchema = z.object({
  text: z.string().trim().min(1, "Enter a feature request.")
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
      text: "Feature request sent.",
      type: "success"
    });

    reset();
    setIsOpen.off();
  };

  return (
    <Popover onOpenChange={(open) => (open ? setIsOpen.on() : setIsOpen.off())} open={isOpen}>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="sm">
          <MessageCircleIcon />
          Request a feature
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-[min(24rem,calc(100vw-2rem))]">
        <form onSubmit={handleSubmit(createWish)}>
          <Field data-invalid={Boolean(errors.text)}>
            <FieldLabel htmlFor="feature-request">Feature request</FieldLabel>
            <TextArea
              id="feature-request"
              placeholder="Describe what would improve your workflow."
              className="resize-none"
              rows={6}
              aria-invalid={Boolean(errors.text)}
              {...register("text")}
            />
            <FieldError errors={[errors.text]} />
          </Field>
          <div className="flex justify-end pt-2">
            <Button variant="neutral" type="submit" isPending={isSubmitting}>
              Send
            </Button>
          </div>
        </form>
      </PopoverContent>
    </Popover>
  );
};
