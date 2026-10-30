import * as UI from "@app/components/v4/ui/alert-dialog";
import { Button } from "@app/components/v4/ui/button";

export default function Example() {
  return (
    <UI.AlertDialog>
      <UI.AlertDialogTrigger asChild>
        <Button variant="outline">Review clients</Button>
      </UI.AlertDialogTrigger>
      <UI.AlertDialogContent>
        <UI.AlertDialogHeader>
          <UI.AlertDialogTitle>Review 24 client grants</UI.AlertDialogTitle>
          <UI.AlertDialogDescription>
            These fictional clients would lose access if this grant were revoked.
          </UI.AlertDialogDescription>
        </UI.AlertDialogHeader>
        <ul>
          {Array.from({ length: 24 }, (_, index) => (
            <li key={index}>Deployment client {index + 1}: Staging read access</li>
          ))}
        </ul>
        <UI.AlertDialogFooter>
          <UI.AlertDialogCancel>Keep grants</UI.AlertDialogCancel>
        </UI.AlertDialogFooter>
      </UI.AlertDialogContent>
    </UI.AlertDialog>
  );
}
