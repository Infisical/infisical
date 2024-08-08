import { useEffect, useState } from "react";
import { Controller, useForm } from "react-hook-form";
import { faCheck } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { zodResolver } from "@hookform/resolvers/zod";
import slugify from "@sindresorhus/slugify";
import { z } from "zod";

import { createNotification } from "@app/components/notifications";
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
  slug: z
    .string()
    .trim()
    .toLowerCase()
    .refine((v) => slugify(v) === v, {
      message: "Invalid slug. Slug can only contain alphanumeric characters and hyphens."
    }),
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

  const { currentWorkspace } = useWorkspace();
  const workspaceId = currentWorkspace?.id || "";

  const { mutateAsync: createWsTag } = useCreateWsTag();

  const [showHexInput, setShowHexInput] = useState<boolean>(false);
  const selectedTagColor = watch("color", secretTagsColors[0].hex);

  useEffect(() => {
    if (!isOpen) reset();
  }, [isOpen]);

  const onFormSubmit = async ({ slug, color }: FormData) => {
    try {
      await createWsTag({
        workspaceID: workspaceId,
        tagColor: color,
        tagSlug: slug
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
            name="slug"
            defaultValue=""
            render={({ field, fieldState: { error } }) => (
              <FormControl label="Tag Slug" isError={Boolean(error)} errorText={error?.message}>
                <Input {...field} placeholder="Type your tag slug" />
              </FormControl>
            )}
          />
          <div className="mt-2">
            <div className="mb-0.5 ml-1 block text-sm font-normal text-mineshaft-400">
              Tag Color
            </div>
            <div className="flex space-x-2">
              <div className="flex items-center justify-center rounded border border-mineshaft-500 bg-mineshaft-900 p-2 ">
                <div
                  className="h-6 w-6 rounded-full"
                  style={{ background: `${selectedTagColor}` }}
                />
              </div>
              <div className="flex flex-grow items-center rounded border-mineshaft-500 bg-mineshaft-900 px-1 pr-2">
                {!showHexInput ? (
                  <div className="inline-flex items-center gap-3 pl-3">
                    {secretTagsColors.map(($tagColor: TagColor) => {
                      return (
                        <div key={`tag-color-${$tagColor.id}`}>
                          <Tooltip content={`${$tagColor.name}`}>
                            <div
                              className=" flex h-[26px] w-[26px] items-center justify-center rounded-full border-2 border-transparent bg-[#bec2c8] p-2 hover:border-black hover:shadow-lg hover:ring-2 hover:ring-offset-2"
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
                  <div className="tags-hex-wrapper flex flex-grow items-center px-2">
                    <div className="relative flex items-center rounded-md ">
                      {isValidHexColor(selectedTagColor) && (
                        <div
                          className="flex h-7 w-7 items-center justify-center rounded-full"
                          style={{ background: `${selectedTagColor}` }}
                        >
                          <FontAwesomeIcon icon={faCheck} style={{ color: "#00000070" }} />
                        </div>
                      )}
                      {!isValidHexColor(selectedTagColor) && (
                        <div className="bg-blue h-7 w-7 rounded-full border border-dashed border-mineshaft-500" />
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
                <div className="mx-4 h-8 border border-mineshaft-500" />
                <div className="flex h-7 w-7 items-center justify-center">
                  <div
                    className={`flex h-7 w-7 cursor-pointer items-center  justify-center rounded-sm border border-mineshaft-500 bg-transparent bg-mineshaft-900 p-2 hover:ring-2  hover:ring-offset-1 ${
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
