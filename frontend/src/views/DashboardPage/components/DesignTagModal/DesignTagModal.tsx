import { Controller, useForm } from "react-hook-form";
import { yupResolver } from "@hookform/resolvers/yup";
import * as yup from "yup";

import { Button, FormControl, Input, ModalClose, Tooltip, IconButton, Tag } from "@app/components/v2";
import { useToggle } from "@app/hooks";
import { TagDesign } from "~/hooks/api/tags/types";

import {
  faEye,
  faEyeSlash
} from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { useState } from 'react';
import { WsTag } from '../../../../hooks/api/tags/types';

type TagData = {
  tagBackground: string;
  tagLabel: string
}

type Props = {
  onDesignTag: (tagData: TagData) => void;
  selectedTag: WsTag
};

const designTagSchema = yup.object({
  tagBackground: yup.string().required().trim().label("Tag Background"),
  tagLabel: yup.string().required().trim().label("Tag Label"),
});
type FormData = yup.InferType<typeof designTagSchema>;


export const DesignTagModal = ({ onDesignTag, selectedTag }: Props): JSX.Element => {
  const [tagDesignObj, setTagDesignObj] = useState({
    tagColor: {
      bg: "",
      text: ""
    }
  })

  const {
    control,
    reset,
    formState,
    handleSubmit,
    setValue
  } = useForm<FormData>({
    resolver: yupResolver(designTagSchema)
  });

  const onFormSubmit = ({ tagBackground, tagLabel }: FormData) => {
    onDesignTag({ tagBackground, tagLabel });
    reset();
  };

  const [previewTag, setPreviewTag] = useToggle(false);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>, type: string) => {
    setTagDesignObj((prev: { tagColor: { bg: string, text: string }; }) => ({
      tagColor: {
        ...prev.tagColor,
        [type]: e.target.value
      }
    }))
    if (type === 'bg') {
      setValue('tagBackground', e.target.value)
    } else {
      setValue('tagLabel', e.target.value)
    }
  }

  return (
    <form onSubmit={handleSubmit(onFormSubmit)}>
      <div className="relative">
        <Controller
          control={control}
          name="tagBackground"
          defaultValue=""
          render={({ field, fieldState: { error } }) => {
            return (
              <>
                <FormControl label="Tag Background" isError={Boolean(error)} errorText={error?.message}>
                  <Input {...field} type="color" onChange={(e: React.ChangeEvent<HTMLInputElement>) => handleInputChange(e, 'bg')} />
                </FormControl>
              </>
            )
          }}
        />
        {/* <Tooltip content={previewTag ? "Hide Preview" : "Show Preview"}> */}
        <div  >
          <FontAwesomeIcon icon={previewTag ? faEye : faEyeSlash} onClick={() => setPreviewTag.toggle()} className="absolute top-[2px] left-[127px] cursor-pointer" />
          {previewTag && (
            <Tag
              styles={{
                backgroundColor: tagDesignObj.tagColor.bg,
                color: tagDesignObj.tagColor.text
              }}
              isDisabled={true}
              onClose={() => void (0)}
              key={selectedTag._id}
              className="absolute top-[-5px] right-[-5px] cursor-pointer"
            >
              {selectedTag.slug}
            </Tag>
          )}

        </div>
        {/* </Tooltip> */}
      </div>

      <Controller
        control={control}
        name="tagLabel"
        defaultValue="#000000"
        render={({ field, fieldState: { error } }) => {
          return (
            <>
              <FormControl label="Tag Label" isError={Boolean(error)} errorText={error?.message}>
                <Input {...field} type="color" onChange={(e: React.ChangeEvent<HTMLInputElement>) => handleInputChange(e, 'text')} value={tagDesignObj.tagColor.text} />
              </FormControl>
            </>
          )
        }}
      />
      <div className="mt-8 flex items-center">
        <Button className="mr-4" type="submit" isDisabled={formState.isSubmitting} isLoading={formState.isSubmitting}>
          Save
        </Button>
        <ModalClose asChild>
          <Button variant="plain" colorSchema="secondary">
            Cancel
          </Button>
        </ModalClose>
      </div>
    </form>
  );
};
