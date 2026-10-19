import { useState } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { FileText } from "lucide-react";

import { Button } from "@app/components/v4/ui/button";
import { Icon } from "@app/components/v4/ui/icon";
import {
  Item,
  ItemActions,
  ItemContent,
  ItemDescription,
  ItemMedia,
  ItemTitle,
  Media
} from "@app/components/v4/ui/item";

import { ExampleCell, ExampleGrid } from "../../example-presentation";

const manifestImage = `data:image/svg+xml,${encodeURIComponent(
  renderToStaticMarkup(<FileText xmlns="http://www.w3.org/2000/svg" color="CanvasText" />)
)}`;

export default function Example() {
  const [imageAvailable, setImageAvailable] = useState(true);
  return (
    <ExampleGrid width="full">
      <ExampleCell align="stretch" label="Explicit parts">
        <Item variant="outline">
          <ItemMedia variant="icon">
            <Icon name="key" />
          </ItemMedia>
          <ItemContent>
            <ItemTitle>Staging service</ItemTitle>
            <ItemDescription>Read access to project versions</ItemDescription>
          </ItemContent>
          <ItemActions>
            <Button asChild variant="outline">
              <a href="#input">View settings</a>
            </Button>
          </ItemActions>
        </Item>
      </ExampleCell>
      <ExampleCell align="stretch" label="ItemMedia recipes">
        {(["default", "icon", "image"] as const).map((variant) => (
          <ExampleCell align="stretch" key={variant} label={variant}>
            <Item variant="outline">
              <ItemMedia variant={variant}>
                {variant === "default" && <span>ENV</span>}
                {variant === "icon" && <Icon name="file" />}
                {variant === "image" &&
                  (imageAvailable ? (
                    <img
                      src={manifestImage}
                      alt="Staging deployment manifest thumbnail"
                      onError={() => setImageAvailable(false)}
                    />
                  ) : (
                    <Icon name="file" label="Manifest preview unavailable" />
                  ))}
              </ItemMedia>
              <ItemContent>
                <ItemTitle>Staging deployment manifest</ItemTitle>
                <ItemDescription>Environment configuration, staging.env</ItemDescription>
              </ItemContent>
            </Item>
          </ExampleCell>
        ))}
        {!imageAvailable && (
          <p role="status" className="sr-only">
            Manifest preview unavailable
          </p>
        )}
      </ExampleCell>
      <ExampleCell align="stretch" label="Media sizes">
        <ExampleGrid width="compact">
          {(["sm", "md", 24] as const).map((size) => (
            <ExampleCell
              align="stretch"
              key={size}
              label={typeof size === "number" ? `${size}px` : size}
            >
              <Media icon="key" size={size} />
            </ExampleCell>
          ))}
        </ExampleGrid>
      </ExampleCell>
      <ExampleCell align="stretch" label="Linked row">
        <Item asChild>
          <a href="#input">
            <ItemContent>
              <ItemTitle>Input guide</ItemTitle>
              <ItemDescription>Provider configuration controls</ItemDescription>
            </ItemContent>
          </a>
        </Item>
      </ExampleCell>
    </ExampleGrid>
  );
}
