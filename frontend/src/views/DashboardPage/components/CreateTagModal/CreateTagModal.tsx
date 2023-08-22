import { useState, useEffect } from 'react';
import { Controller, useForm } from "react-hook-form";
import { yupResolver } from "@hookform/resolvers/yup";
import * as yup from "yup";
import { secretTagsColors } from "~/const"
import {
  faCheck
} from "@fortawesome/free-solid-svg-icons";

import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";

import { Button, FormControl, Input, ModalClose, Tooltip } from "@app/components/v2";
import { isValidHexColor } from "~/components/utilities/isValidHexColor";
import { TagColor } from '~/hooks/api/tags/types';


type Props = {
  onCreateTag: (tagName: string, tagColor: string) => Promise<void>;
};

const createTagSchema = yup.object({
  name: yup.string().required().trim().label("Tag Name")
});
type FormData = yup.InferType<typeof createTagSchema>;

export const CreateTagModal = ({ onCreateTag }: Props): JSX.Element => {
  const {
    control,
    reset,
    formState: { isSubmitting },
    handleSubmit
  } = useForm<FormData>({
    resolver: yupResolver(createTagSchema)
  });

  const [tagsColors, setTagsColors] = useState<TagColor>(secretTagsColors)
  const [selectedTagColor, setSelectedTagColor] = useState<TagColor>({})
  const [showHexInput, setShowHexInput] = useState<boolean>(false)
  const [tagColor, setTagColor] = useState<string>("")


  const onFormSubmit = async ({ name }: FormData) => {
    await onCreateTag(name, tagColor);
    reset();
  };

  useEffect(() => {
    const clonedTagColors = [...tagsColors]
    for (const tagColor of clonedTagColors) {
      if (tagColor.selected) {
        setSelectedTagColor(tagColor)
        setTagColor(tagColor.hex)
        break
      }
    }
  }, [])

  useEffect(() => {
    const tagsList = document.querySelector(".secret-tags-wrapper")
    const tagsHexWrapper = document.querySelector(".tags-hex-wrapper")

    if (showHexInput) {
      tagsList?.classList.add('hide-tags')
      tagsList?.classList.remove('show-tags')
      tagsHexWrapper?.classList.add('show-hex-input')
      tagsHexWrapper?.classList.remove('hide-hex-input')
    } else {
      tagsList?.classList.remove('hide-tags')
      tagsList?.classList.add('show-tags')
      tagsHexWrapper?.classList.remove('show-hex-input')
      tagsHexWrapper?.classList.add('hide-hex-input')
    }
  }, [showHexInput])

  const handleColorChange = (tagColor: TagColor) => {
    const clonedTagColors = [...tagsColors]
    const tagColorIndex = clonedTagColors.findIndex(_tagColor => _tagColor.id === tagColor.id)
    const _selectedTagColor = clonedTagColors[tagColorIndex]
    clonedTagColors.forEach(tagColor => {
      tagColor.selected = false
    })
    if (selectedTagColor.id !== tagColor.id) {
      _selectedTagColor.selected = !_selectedTagColor.selected
      setSelectedTagColor(_selectedTagColor)
      setTagColor(_selectedTagColor.hex)
    }
  }

  return (
    <>
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
          <label className="text-mineshaft-400">Tag color</label>
          <div className="flex gap-2 h-[50px]">
            <div className="w-[12%]   h-[2.813rem]	 inline-flex font-inter items-center justify-center border relative rounded-md border-mineshaft-500  bg-mineshaft-900 hover:bg-mineshaft-800">
              <div className={`w-[26px]  h-[26px] rounded-full`} style={{ background: `${tagColor}` }}></div>
            </div>

            <div className="w-[88%] h-[2.813rem] flex-wrap inline-flex gap-3 items-center border relative rounded-md border-mineshaft-500 bg-mineshaft-900 hover:bg-mineshaft-800 relative">
              {
                (
                  <div className="flex-wrap	 inline-flex gap-3 items-center secret-tags-wrapper pl-3">
                    {
                      tagsColors.map((tagColor: TagColor) => {
                        return (
                          <Tooltip content={`${tagColor.name}`}>
                            <div className={`flex items-center justify-center w-[26px] h-[26px] hover:ring-offset-2 hover:ring-2 bg-[#bec2c8] border-2 p-2 hover:shadow-lg border-transparent hover:border-black rounded-full`} key={`tag-${tagColor.id}`} style={{ backgroundColor: `${tagColor.hex}` }} onClick={() => handleColorChange(tagColor)}>
                              {
                                tagColor.selected && <FontAwesomeIcon icon={faCheck} style={{ color: `#00000070` }} />
                              }
                            </div>
                          </Tooltip>
                        )
                      })
                    }
                  </div>
                )
              }

              <div className="flex items-center gap-2 px-2 tags-hex-wrapper" >
                <div className="w-1/6	  flex items-center  relative rounded-md hover:bg-mineshaft-800">
                  {
                    isValidHexColor(tagColor) && (
                      <div className={`w-[26px]  h-[26px] rounded-full flex items-center justify-center`} style={{ background: `${tagColor}` }}>
                        <FontAwesomeIcon icon={faCheck} style={{ color: `#00000070` }} />
                      </div>
                    )
                  }

                  {
                    !isValidHexColor(tagColor) && (
                      <div class="border-dashed border bg-blue rounded-full w-[26px] h-[26px] border-mineshaft-500"></div>
                    )
                  }
                </div>
                <div className="w-10/12">
                  <Input
                    variant="plain"
                    className="w-full focus:text-bunker-100 focus:ring-transparent bg-transparent"
                    autoCapitalization={false}
                    value={tagColor}
                    onChange={(e: React.ChangeEvent<HTMLInputElement>) => setTagColor(e.target.value)}
                  />
                </div>
              </div>

              <div className="w-[26px] h-[26px]  flex items-center justify-center absolute top-[10px] right-[-4px] translate-x-[-50%]">
                <div className="border-mineshaft-500  border h-[2.1rem] mr-4 absolute right-5"></div>
                <div className={`flex items-center justify-center w-[26px] h-[26px] bg-transparent cursor-pointer hover:ring-offset-1 hover:ring-2 border-mineshaft-500 border bg-mineshaft-900 rounded-[3px]  p-2 ${showHexInput ? 'tags-conic-bg rounded-full' : ''}`} onClick={() => setShowHexInput((prev) => !prev)} style={{ border: '1px solid rgba(220, 216, 254, 0.376)' }}>
                  {
                    !showHexInput && <span>#</span>
                  }
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="mt-8 flex items-center">
          <Button className="mr-4" type="submit" isDisabled={isSubmitting} isLoading={isSubmitting}>
            Create
          </Button>
          <ModalClose asChild>
            <Button variant="plain" colorSchema="secondary">
              Cancel
            </Button>
          </ModalClose>
        </div>
      </form>
    </>
  );
};
