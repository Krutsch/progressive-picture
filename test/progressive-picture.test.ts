import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { forceLoad, observe } from "../src/progressive-picture";

class MockImage {
  static requests: string[] = [];

  currentSrc = "";
  onerror: ((event: Event) => unknown) | null = null;
  onload: ((event: Event) => unknown) | null = null;
  sizes = "";

  set src(value: string) {
    this.load(value);
  }

  set srcset(value: string) {
    this.load(value);
  }

  setAttribute(name: string, value: string) {
    if (name === "sizes") {
      this.sizes = value;
    } else if (name === "srcset") {
      this.srcset = value;
    } else if (name === "src") {
      this.src = value;
    }
  }

  private load(value: string) {
    MockImage.requests.push(value);
    this.currentSrc = value.split(",", 1)[0].trim().split(/\s+/, 1)[0];
    setTimeout(() => {
      const handler = value.includes("fail") ? this.onerror : this.onload;
      handler?.(new Event(value.includes("fail") ? "error" : "load"));
    }, 0);
  }
}

function setCurrentSrc(img: HTMLImageElement, value: string) {
  Object.defineProperty(img, "currentSrc", {
    configurable: true,
    value: new URL(value, document.baseURI).href,
  });
}

async function settlesWithin(promise: Promise<unknown>, timeoutMs = 100) {
  let timeout: ReturnType<typeof setTimeout>;
  const result = await Promise.race([
    promise.then(() => "settled" as const),
    new Promise<"timed out">((resolve) => {
      timeout = setTimeout(() => resolve("timed out"), timeoutMs);
    }),
  ]);
  clearTimeout(timeout!);
  return result;
}

describe("forceLoad", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
    MockImage.requests = [];
    vi.stubGlobal("Image", MockImage);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("preloads the active source and preserves every element's data-src", async () => {
    document.body.innerHTML = `
      <picture>
        <source srcset="/mobile/shared-preview.webp" data-src="/mobile/photo.webp">
        <source srcset="/desktop/shared-preview.webp" data-src="/desktop/photo.webp">
        <img src="/fallback-preview.jpg" data-src="/fallback/photo.jpg" data-alt="Photo">
      </picture>
    `;
    const picture = document.querySelector("picture")!;
    const img = picture.querySelector("img")!;
    const sources = picture.querySelectorAll("source");
    setCurrentSrc(img, "/desktop/shared-preview.webp");

    await forceLoad(picture);

    expect(MockImage.requests).toEqual(["/desktop/photo.webp"]);
    expect(sources[0].getAttribute("srcset")).toBe("/mobile/photo.webp");
    expect(sources[1].getAttribute("srcset")).toBe("/desktop/photo.webp");
    expect(img.getAttribute("src")).toBe("/fallback/photo.jpg");
    expect(picture.querySelectorAll("[data-src]")).toHaveLength(0);
    expect(img.alt).toBe("Photo");
    expect(img.classList.contains("img-progressive")).toBe(true);
  });

  it("matches the selected candidate in a responsive srcset", async () => {
    document.body.innerHTML = `
      <picture>
        <source
          srcset="/small-preview.webp 480w, /large-preview.webp 960w"
          data-src="/small.webp 480w, /large.webp 960w"
        >
        <img src="/fallback-preview.jpg" data-src="/fallback.jpg">
      </picture>
    `;
    const picture = document.querySelector("picture")!;
    setCurrentSrc(picture.querySelector("img")!, "/large-preview.webp");

    await forceLoad(picture);

    expect(MockImage.requests).toEqual(["/small.webp 480w, /large.webp 960w"]);
  });

  it("leaves the preview intact when preloading fails", async () => {
    document.body.innerHTML =
      '<img src="/preview.jpg" data-src="/fail.jpg" data-alt="Photo">';
    const img = document.querySelector("img")!;
    setCurrentSrc(img, "/preview.jpg");

    expect(await settlesWithin(forceLoad(img))).toBe("settled");

    expect(img.getAttribute("src")).toBe("/preview.jpg");
    expect(img.dataset.src).toBe("/fail.jpg");
    expect(img.dataset.alt).toBe("Photo");
    expect(img.classList.contains("img-progressive")).toBe(false);
  });

  it("reuses an in-flight preload", async () => {
    document.body.innerHTML = '<img src="/preview.jpg" data-src="/photo.jpg">';
    const img = document.querySelector("img")!;
    setCurrentSrc(img, "/preview.jpg");

    const firstLoad = forceLoad(img);
    const secondLoad = forceLoad(img);

    await Promise.all([firstLoad, secondLoad]);
    expect(MockImage.requests).toEqual(["/photo.jpg"]);
  });
});

describe("observe", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    document.body.innerHTML = "";
  });

  it("observes existing pictures and returns a cleanup function", () => {
    const observed: Element[] = [];
    const disconnectIntersection = vi.fn();

    class MockIntersectionObserver {
      disconnect = disconnectIntersection;
      observe = vi.fn((element: Element) => observed.push(element));
      unobserve = vi.fn();
    }

    vi.stubGlobal("IntersectionObserver", MockIntersectionObserver);
    document.body.innerHTML = "<main><picture><img></picture></main>";

    const cleanup = observe();

    expect(observed).toEqual([document.querySelector("picture")]);
    cleanup();
    expect(disconnectIntersection).toHaveBeenCalledOnce();
  });

  it("observes pictures added later and unobserves removed pictures", async () => {
    const observed: Element[] = [];
    const unobserve = vi.fn();

    class MockIntersectionObserver {
      disconnect = vi.fn();
      observe = vi.fn((element: Element) => observed.push(element));
      unobserve = unobserve;
    }

    vi.stubGlobal("IntersectionObserver", MockIntersectionObserver);
    const cleanup = observe();
    const container = document.createElement("section");
    container.innerHTML = "<picture><img></picture>";
    const picture = container.querySelector("picture")!;

    document.body.append(container);
    await vi.waitFor(() => expect(observed).toContain(picture));

    container.remove();
    await vi.waitFor(() => expect(unobserve).toHaveBeenCalledWith(picture));
    cleanup();
  });
});
