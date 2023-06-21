import { faXmark } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import * as Popover from "@radix-ui/react-popover";

type Props = {
  children: any; 
  text: string; 
  onChangeHandler: (value: string, id: string) => void; 
  id: string;
};

export type PopoverProps = Props;

export const PopoverObject = ({children, text, onChangeHandler, id}: Props) => (
  <Popover.Root>
    <Popover.Trigger asChild className='data-[state=open]:outline data-[state=open]:outline-primary data-[state=closed]:hover:outline data-[state=closed]:hover:outline-mineshaft-400'>
      {children}
    </Popover.Trigger>
    <Popover.Portal>
      <Popover.Content
        className="rounded z-[100] p-3 w-[460px] min-h-fit border border-chicago-700 bg-mineshaft-600 shadow-[0_10px_38px_-10px_hsla(206,22%,7%,.35),0_10px_20px_-15px_hsla(206,22%,7%,.2)] focus:shadow-[0_10px_38px_-10px_hsla(206,22%,7%,.35),0_10px_20px_-15px_hsla(206,22%,7%,.2),0_0_0_2px_theme(colors.violet7)] will-change-[transform,opacity] data-[state=open]:data-[side=top]:animate-slideDownAndFade data-[state=open]:data-[side=right]:animate-slideLeftAndFade data-[state=open]:data-[side=bottom]:animate-slideUpAndFade data-[state=open]:data-[side=left]:animate-slideRightAndFade"
        sideOffset={5}
        hideWhenDetached
        side="left"
      >
        <div className="flex flex-col pt-2 dark">
          <p className="text-bunker-200 text-[15px] leading-[0px] font-medium mb-5">Comment</p>
          <textarea
            onChange={(e) => onChangeHandler(e.target.value, id)}
            // type={type}
            value={text}
            className='z-10 dark:[color-scheme:dark] peer h-[20rem] ph-no-capture bg-bunker-600 border border-mineshaft-500 rounded-md py-2.5 caret-bunker-200 text-sm px-2 w-full outline-none text-bunker-300 focus:text-bunker-100 placeholder:text-bunker-400 placeholder:focus:text-transparent placeholder duration-200'
            spellCheck="false"
            placeholder='–'
          />
        </div>
        <Popover.Close
          className="rounded-full h-[25px] w-[25px] inline-flex items-center justify-center text-bunker-300 hover:text-white absolute top-[5px] right-[5px] hover:bg-violet4 focus:shadow-[0_0_0_2px] focus:shadow-violet7 outline-none cursor-default"
          aria-label="Close"
        >
          <FontAwesomeIcon icon={faXmark} />
        </Popover.Close>
        <Popover.Arrow className="fill-chicago-700" />
      </Popover.Content>
    </Popover.Portal>
  </Popover.Root>
);

PopoverObject.displayName = "Popover";
