import { renderToStaticMarkup } from "react-dom/server";
import { expect, it } from "vitest";

import { Detail, DetailGroupHeader, DetailLabel, DetailValue } from "./detail";

it("renders each Detail as its own description list and keeps the header action out of the heading", () => {
  const markup = renderToStaticMarkup(
    <>
      <DetailGroupHeader action={<button type="button">Edit</button>}>General</DetailGroupHeader>
      <Detail>
        <DetailLabel>ID</DetailLabel>
        <DetailValue>gw-1</DetailValue>
      </Detail>
    </>
  );
  expect(markup).toMatch(/<h3[^>]*>General<\/h3>/);
  expect(markup).toMatch(/<dl[^>]*><dt[^>]*>ID<\/dt><dd[^>]*>gw-1<\/dd><\/dl>/);
});
