import React, {
  ChangeEvent,
  DragEvent,
  forwardRef,
  useImperativeHandle,
  useRef,
  useState
} from "react";
import { faUpload } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { twMerge } from "tailwind-merge";

import { useToggle } from "@app/hooks";

type Props = {
  accept?: string;
  onData: (file: File) => void;
  isSmaller: boolean;
  text?: string;
  isDisabled?: boolean;
};

export const GenericDropzone = forwardRef<HTMLInputElement, Props>(
  ({ onData, isSmaller, text, isDisabled, accept }: Props, ref): JSX.Element => {
    const [isDragActive, setDragActive] = useToggle();
    const [selectedFileName, setSelectedFileName] = useState<string | null>(null);
    const inputRef = useRef<HTMLInputElement>(null);

    useImperativeHandle(ref, () => inputRef.current as HTMLInputElement);

    const updateSelectedFileName = () => {
      if (inputRef.current?.files?.[0]) {
        setSelectedFileName(inputRef.current.files[0].name);
      } else {
        setSelectedFileName(null);
      }
    };

    const handleDrag = (e: DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      if (e.type === "dragenter" || e.type === "dragover") {
        setDragActive.on();
      } else if (e.type === "dragleave") {
        setDragActive.off();
      }
    };

    const handleDrop = (e: DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      if (!e.dataTransfer) {
        return;
      }

      e.dataTransfer.dropEffect = "copy";
      setDragActive.off();
      const file = e.dataTransfer.files[0];
      onData(file);
      setSelectedFileName(file.name);
    };

    const handleFileUpload = (e: ChangeEvent<HTMLInputElement>) => {
      e.preventDefault();

      if (!e.target?.files?.[0]) {
        return;
      }
      onData(e.target.files[0]);
      updateSelectedFileName();
    };

    React.useEffect(() => {
      updateSelectedFileName();
    }, []);

    return (
      <div>
        <div
          onDragEnter={handleDrag}
          onDragLeave={handleDrag}
          onDragOver={handleDrag}
          onDrop={handleDrop}
          className={twMerge(
            "relative mx-0.5 mb-4 mt-4 flex cursor-pointer items-center justify-center rounded-md bg-mineshaft-900 py-4 px-2 text-sm text-mineshaft-200 opacity-60 outline-dashed outline-2 outline-chicago-600 duration-200 hover:opacity-100",
            isDragActive && "opacity-100",
            !isSmaller && "mx-auto w-full max-w-3xl flex-col space-y-4 py-20"
          )}
        >
          {selectedFileName ? (
            <p>{selectedFileName}</p>
          ) : (
            <div className="flex flex-col items-center justify-center space-y-2">
              <div>
                <FontAwesomeIcon icon={faUpload} size={isSmaller ? "2x" : "5x"} />
              </div>
              <div>
                <p className="">{text}</p>
              </div>
              <input
                ref={inputRef}
                disabled={isDisabled}
                id="fileSelect"
                type="file"
                className="absolute h-full w-full cursor-pointer opacity-0"
                accept={accept}
                onChange={handleFileUpload}
              />
            </div>
          )}
        </div>
      </div>
    );
  }
);

GenericDropzone.displayName = "GenericDropzone";
