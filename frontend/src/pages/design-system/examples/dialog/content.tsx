import { Button } from "@app/components/v4/ui/button";
import * as UI from "@app/components/v4/ui/dialog";

export default function Example() {
  return (
    <UI.Dialog>
      <UI.DialogTrigger asChild>
        <Button variant="outline">Review history</Button>
      </UI.DialogTrigger>
      <UI.DialogContent>
        <UI.DialogHeader>
          <UI.DialogTitle>Environment history</UI.DialogTitle>
          <UI.DialogDescription>24 fictional changes, newest first.</UI.DialogDescription>
        </UI.DialogHeader>
        <ol>
          {Array.from({ length: 24 }, (_, index) => (
            <li key={index}>Version {24 - index}: deployment configuration updated.</li>
          ))}
        </ol>
        <UI.DialogFooter showCloseButton />
      </UI.DialogContent>
    </UI.Dialog>
  );
}
