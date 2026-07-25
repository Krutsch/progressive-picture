import { expect, test } from "@playwright/test";

for (const scenario of [
  { name: "desktop", width: 800 },
  { name: "mobile", width: 375 },
]) {
  test(`loads the active ${scenario.name} source in a real browser`, async ({
    page,
  }) => {
    const requestedImages: string[] = [];
    page.on("request", (request) => {
      if (request.resourceType() === "image") {
        requestedImages.push(request.url());
      }
    });
    await page.setViewportSize({ width: scenario.width, height: 600 });
    await page.goto("/test/browser/fixture.html");

    const picture = page.locator("picture");
    const img = picture.locator("img");
    await expect
      .poll(() =>
        img.evaluate((element) => String(Reflect.get(element, "currentSrc"))),
      )
      .toContain(`${scenario.name}-preview`);
    await expect(img).not.toHaveClass(/img-progressive/);

    await picture.scrollIntoViewIfNeeded();

    await expect(img).toHaveClass(/img-progressive/);
    await expect(img).toHaveAttribute("alt", "Progressively loaded test image");
    await expect(img).not.toHaveAttribute("data-src");
    await expect
      .poll(() =>
        img.evaluate((element) => String(Reflect.get(element, "currentSrc"))),
      )
      .toContain(`${scenario.name}-full`);
    await expect(picture.locator("source").nth(0)).toHaveAttribute(
      "srcset",
      "/test/browser/pixel.svg?desktop-full",
    );
    await expect(picture.locator("source").nth(1)).toHaveAttribute(
      "srcset",
      "/test/browser/pixel.svg?mobile-full",
    );

    expect(
      requestedImages.some((url) => url.endsWith(`${scenario.name}-full`)),
    ).toBe(true);
    expect(
      requestedImages.some((url) =>
        url.endsWith(
          `${scenario.name === "desktop" ? "mobile" : "desktop"}-full`,
        ),
      ),
    ).toBe(false);
  });
}
