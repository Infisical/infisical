import { useEffect, useState } from "react";
import { Controller, useForm } from "react-hook-form";
import { faCheck } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";

import { useNotificationContext } from "@app/components/context/Notifications/NotificationProvider";
import {
  Button,
  FormControl,
  Input,
  Modal,
  ModalClose,
  ModalContent,
  Tooltip
} from "@app/components/v2";
import { useWorkspace } from "@app/context";
import { useCreateWsTag } from "@app/hooks/api";

export const secretTagsColors = [
  {
    id: 1,
    hex: "#bec2c8",
    rgba: "rgb(128,128,128, 0.8)",
    name: "Grey"
  },
  {
    id: 2,
    hex: "#95a2b3",
    rgba: "rgb(0,0,255, 0.8)",
    name: "blue"
  },
  {
    id: 3,
    hex: "#5e6ad2",
    rgba: "rgb(128,0,128, 0.8)",
    name: "Purple"
  },
  {
    id: 4,
    hex: "#26b5ce",
    rgba: "rgb(0,128,128, 0.8)",
    name: "Teal"
  },
  {
    id: 5,
    hex: "#4cb782",
    rgba: "rgb(0,128,0, 0.8)",
    name: "Green"
  },
  {
    id: 6,
    hex: "#f2c94c",
    rgba: "rgb(255,255,0, 0.8)",
    name: "Yellow"
  },
  {
    id: 7,
    hex: "#f2994a",
    rgba: "rgb(128,128,0, 0.8)",
    name: "Orange"
  },
  {
    id: 8,
    hex: "#f7c8c1",
    rgba: "rgb(128,0,0, 0.8)",
    name: "Pink"
  },
  {
    id: 9,
    hex: "#eb5757",
    rgba: "rgb(255,0,0, 0.8)",
    name: "Red"
  }
];

const isValidHexColor = (hexColor: string) => {
  const hexColorPattern = /^#?([0-9A-Fa-f]{3}|[0-9A-Fa-f]{6})$/;

  return hexColorPattern.test(hexColor);
};

type Props = {
  isOpen?: boolean;
  onToggle: (isOpen: boolean) => void;
};

const createTagSchema = z.object({
  name: z.string().trim(),
  color: z.string().trim()
});

type FormData = z.infer<typeof createTagSchema>;
type TagColor = {
  id: number;
  hex: string;
  rgba: string;
  name: string;
};

export const CreateTagModal = ({ isOpen, onToggle }: Props): JSX.Element => {
  const {
    control,
    reset,
    watch,
    setValue,
    formState: { isSubmitting },
    handleSubmit
  } = useForm<FormData>({
    resolver: zodResolver(createTagSchema)
  });
  const { createNotification } = useNotificationContext();
  const { currentWorkspace } = useWorkspace();
  const workspaceId = currentWorkspace?._id || "";

  const { mutateAsync: createWsTag } = useCreateWsTag();

  const [showHexInput, setShowHexInput] = useState<boolean>(false);
  const selectedTagColor = watch("color", secretTagsColors[0].hex);

  useEffect(()=>{
    if(!isOpen) reset(); 
  },[isOpen])

  const onFormSubmit = async ({ name, color }: FormData) => {
    try {
      await createWsTag({
        workspaceID: workspaceId,
        tagName: name,
        tagColor: color,
        tagSlug: name.replace(" ", "_")
      });
      onToggle(false);
      reset();
      createNotification({
        text: "Successfully created a tag",
        type: "success"
      });
    } catch (error) {
      console.error(error);
      createNotification({
        text: "Failed to create a tag",
        type: "error"
      });
    }
  };

  return (
    <Modal isOpen={isOpen} onOpenChange={onToggle}>
      <ModalContent
        title="Create tag"
        subTitle="Specify your tag name, and the slug will be created automatically."
      >
        <form onSubmit={handleSubmit(onFormSubmit)}>
          <Controller
            control={control}
            name="name"
            defaultValue=""
            render={({ field, fieldState: { error } }) => (
              <FormControl label="Tag Name" isError={Boolean(error)} errorText={error?.message}>
                <Input {...field} placeholder="Type your tag name" />
              </FormControl>
            )}
          />
          <div className="mt-2">
            <div className="mb-0.5 ml-1 block text-sm font-normal text-mineshaft-400">
              Tag Color
            </div>
            <div className="flex space-x-2">
              <div className="p-2 rounded flex items-center justify-center border border-mineshaft-500 bg-mineshaft-900 ">
                <div
                  className="w-6 h-6 rounded-full"
                  style={{ background: `${selectedTagColor}` }}
                />
              </div>
              <div className="flex-grow flex items-center rounded border-mineshaft-500 bg-mineshaft-900 px-1 pr-2">
                {!showHexInput ? (
                  <div className="inline-flex gap-3 items-center pl-3">
                    {secretTagsColors.map(($tagColor: TagColor) => {
                      return (
                        <div key={`tag-color-${$tagColor.id}`}>
                          <Tooltip content={`${$tagColor.name}`}>
                            <div
                              className=" flex items-center justify-center w-[26px] h-[26px] hover:ring-offset-2 hover:ring-2 bg-[#bec2c8] border-2 p-2 hover:shadow-lg border-transparent hover:border-black rounded-full"
                              key={`tag-${$tagColor.id}`}
                              style={{ backgroundColor: `${$tagColor.hex}` }}
                              onClick={() => setValue("color", $tagColor.hex)}
                              tabIndex={0}
                              role="button"
                              onKeyDown={() => {}}
                            >
                              {$tagColor.hex === selectedTagColor && (
                                <FontAwesomeIcon icon={faCheck} style={{ color: "#00000070" }} />
                              )}
                            </div>
                          </Tooltip>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <div className="flex flex-grow items-center px-2 tags-hex-wrapper">
                    <div className="flex items-center relative rounded-md ">
                      {isValidHexColor(selectedTagColor) && (
                        <div
                          className="w-7 h-7 rounded-full flex items-center justify-center"
                          style={{ background: `${selectedTagColor}` }}
                        >
                          <FontAwesomeIcon icon={faCheck} style={{ color: "#00000070" }} />
                        </div>
                      )}
                      {!isValidHexColor(selectedTagColor) && (
                        <div className="border-dashed border bg-blue rounded-full w-7 h-7 border-mineshaft-500" />
                      )}
                    </div>
                    <div className="flex-grow">
                      <Input
                        variant="plain"
                        value={selectedTagColor}
                        onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                          setValue("color", e.target.value)
                        }
                      />
                    </div>
                  </div>
                )}
                <div className="border-mineshaft-500 border h-8 mx-4" />
                <div className="w-7 h-7 flex items-center justify-center">
                  <div
                    className={`flex items-center justify-center w-7 h-7  bg-transparent cursor-pointer hover:ring-offset-1 hover:ring-2 border-mineshaft-500 border bg-mineshaft-900 rounded-sm  p-2 ${
                      showHexInput ? "tags-conic-bg rounded-full" : ""
                    }`}
                    onClick={() => setShowHexInput((prev) => !prev)}
                    style={{ border: "1px solid rgba(220, 216, 254, 0.376)" }}
                    tabIndex={0}
                    role="button"
                    onKeyDown={() => {}}
                  >
                    {!showHexInput && <span>#</span>}
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div className="mt-8 flex items-center">
            <Button
              className="mr-4"
              type="submit"
              isDisabled={isSubmitting}
              isLoading={isSubmitting}
            >
              Create
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
