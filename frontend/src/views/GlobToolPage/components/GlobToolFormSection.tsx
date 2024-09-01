import { ReactNode, useState, useCallback } from 'react';
import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";

import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faCopy } from "@fortawesome/free-solid-svg-icons";

import picomatch from "picomatch";
import { z } from "zod";

import { 
  TextArea,
  Button,
  Input,
  TooltipProvider,
  Tooltip,
  IconButton,
  FormControl,
  FormLabel
} from '@app/components/v2';
import { createNotification } from '@app/components/notifications';

type Props = {
  selectedPath: string;
}

const formSchema = z.object({
  path: z.string().trim(),
  textStrings: z.string().trim()
});

type FormData = z.infer<typeof formSchema>

export const GlobToolFormSection = ({ selectedPath }: Props) => {
  const [output, setOutput] = useState<ReactNode>(null);

  const {
    control,
    watch,
    formState: { isSubmitting },
    handleSubmit
  } = useForm<FormData>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      path: selectedPath,
      textStrings: undefined
    }
  });

  const path = watch("path");
  const onFormSubmit = (data: FormData) => {
    validateStrings(data.path, data.textStrings);
  };

  const handleCopyPathToClipboard = async (value: string) => {
    if (value) {
      try {
        await window.navigator.clipboard.writeText(value);
        createNotification({ type: "success", text: "Copied path to clipboard" });
      } catch (error) {
        console.log(error);
        createNotification({ type: "error", text: "Failed to copy path to clipboard" });
      }
    }
  };

  const validateStrings = useCallback((path: string, testStrings: string) => {
    if (!path || !testStrings) return;

    const matcher = picomatch(path, { dot: true, ignore: '//' });
    const patterns = testStrings.split('\n');

    const newOutput = patterns.map((pattern) => {
      if (pattern.startsWith('//')) {
        return <div key={pattern}>{pattern}</div>
      }

      const isMatch = matcher(pattern);
      const color = isMatch ? 'text-green-500' : 'text-red-500';

      return (
        <div key={pattern} className={color}>
          {isMatch ? "✓" : "✕"} - {pattern}
        </div>
      )
    });

    setOutput(newOutput);
  }, []);

  return (
    <form
      className="flex w-full max-w-7xl flex-col items-center"
      onSubmit={handleSubmit(onFormSubmit)}
    >
      <div className="w-full flex flex-col gap-2 rounded-md border border-mineshaft-600 bg-mineshaft-800 p-6">
        <Controller
          control={control}
          name="path"
          render={({ field, fieldState: { error } }) => (
            <FormControl
              label="Your Path"
              isError={Boolean(error)}
              errorText={error?.message}
              className="mb-2"
            >
              <Input
                {...field}
                rightIcon={
                  <TooltipProvider>
                    <Tooltip content="Copy Path">
                      <IconButton
                        ariaLabel="copy-path"
                        onClick={() => handleCopyPathToClipboard(path)}
                        variant="plain"
                        className="h-full"
                      >
                        <FontAwesomeIcon icon={faCopy} />
                      </IconButton>
                    </Tooltip>
                  </TooltipProvider>
                }
              />
            </FormControl>
          )}
        />
        <Controller
          control={control}
          name="textStrings"
          render={({ field, fieldState: { error } }) => (
            <FormControl
              label="Test Strings"
              isError={Boolean(error)}
              errorText={error?.message}
              className="mb-2"
            >
              <TextArea
                {...field}
                rows={4}
                placeholder="Enter strings to test against the glob pattern..."
                className="h-auto min-h-[5rem] w-full rounded-md border border-mineshaft-600 bg-mineshaft-900 py-1.5 px-2 text-bunker-300 outline-none transition-all placeholder:text-mineshaft-400 hover:border-primary-400/30 focus:border-primary-400/50 group-hover:mr-2"
              />
            </FormControl>
          )}
        />

        <div className="flex flex-col mb-2 w-full">
          <FormLabel label="Output"/>
          <div className="h-auto min-h-[5rem] rounded-md w-full overflow-y-auto p-2 border border-solid border-mineshaft-400 bg-bunker-800 text-gray-400 font-inter whitespace-pre-wrap">
            {output}
          </div>
        </div>

        <div className="flex items-center space-x-4 pt-2">
          <Button type="submit" isDisabled={isSubmitting} isLoading={isSubmitting}>
            Validate
          </Button>
        </div>

      </div>
    </form>
  );
};
