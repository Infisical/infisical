import { useState } from "react";

import { Banner } from "@app/components/v4/ui/alert";
import { Button } from "@app/components/v4/ui/button";

export default function Example() {
  const [visible, setVisible] = useState(true);
  return visible ? (
    <Banner
      onDismiss={() => setVisible(false)}
      action={
        <Button variant="link" asChild>
          <a href="#rules">Read guidance</a>
        </Button>
      }
    >
      This example uses synthetic values.
    </Banner>
  ) : (
    <Button variant="outline" onClick={() => setVisible(true)}>
      Show banner
    </Button>
  );
}
