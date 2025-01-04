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

export const PopoverObject = ({ children, text, onChangeHandler, id }: Props) => (
  <Popover.Root>
    <Popover.Trigger
      asChild
      className="data-[state=open]:outline data-[state=open]:outline-primary data-[state=closed]:hover:outline data-[state=closed]:hover:outline-mineshaft-400"
    >
      {children}
    </Popover.Trigger>
    <Popover.Portal>
      <Popover.Content
        className="z-[100] min-h-fit w-[460px] rounded border border-chicago-700 bg-mineshaft-600 p-3 shadow-[0_10px_38px_-10px_hsla(206,22%,7%,.35),0_10px_20px_-15px_hsla(206,22%,7%,.2)] will-change-[transform,opacity] focus:shadow-[0_10px_38px_-10px_hsla(206,22%,7%,.35),0_10px_20px_-15px_hsla(206,22%,7%,.2),0_0_0_2px_theme(colors.violet7)] data-[state=open]:data-[side=bottom]:animate-slideUpAndFade data-[state=open]:data-[side=left]:animate-slideRightAndFade data-[state=open]:data-[side=right]:animate-slideLeftAndFade data-[state=open]:data-[side=top]:animate-slideDownAndFade"
        sideOffset={5}
        hideWhenDetached
        side="left"
      >
        <div className="dark flex flex-col pt-2">
          <p className="mb-5 text-[15px] font-medium leading-[0px] text-bunker-200">Comment</p>
          <textarea
            onChange={(e) => onChangeHandler(e.target.value, id)}
            // type={type}
            value={text}
            className="ph-no-capture placeholder peer z-10 h-[20rem] w-full rounded-md border border-mineshaft-500 bg-bunker-600 px-2 py-2.5 text-sm text-bunker-300 caret-bunker-200 outline-none duration-200 placeholder:text-bunker-400 focus:text-bunker-100 placeholder:focus:text-transparent dark:[color-scheme:dark]"
            spellCheck="false"
            placeholder="–"
          />
        </div>
        <Popover.Close
          className="hover:bg-violet4 focus:shadow-violet7 absolute right-[5px] top-[5px] inline-flex h-[25px] w-[25px] cursor-default items-center justify-center rounded-full text-bunker-300 outline-none hover:text-white focus:shadow-[0_0_0_2px]"
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
