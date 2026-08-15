import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { forceLoad, observe } from "../src/progressive-picture";

class MockImage {
  static requests: string[] = [];
  static sizes: string[] = [];

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
    MockImage.sizes.push(this.sizes);
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
    MockImage.sizes = [];
    vi.stubGlobal("Image", MockImage);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("promotes the active source and preserves each high-resolution URL", async () => {
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
    expect(img.getAttribute("src")).toBe("/desktop/photo.webp");
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

  it("promotes the selected source into a detached image", async () => {
    document.body.innerHTML = `
      <picture>
        <source srcset="/preview.webp" data-src="/photo.webp">
        <img src="/preview.webp">
      </picture>
    `;
    const picture = document.querySelector("picture")!;
    const clone = picture.cloneNode(true) as HTMLPictureElement;
    const img = clone.querySelector("img")!;

    await forceLoad(clone);

    expect(img.getAttribute("src")).toBe("/photo.webp");
    expect(img.classList.contains("img-progressive")).toBe(true);
    expect(clone.querySelector("source")?.hasAttribute("data-src")).toBe(false);
  });

  it("reselects an already promoted source for the forced rendering size", async () => {
    document.body.innerHTML = `
      <picture>
        <source
          srcset="/photo.webp 500w, /photo-2x.webp 1000w"
          sizes="89vw"
        >
        <img src="/photo-2x.webp">
      </picture>
    `;
    const picture = document.querySelector("picture")!;
    const clone = picture.cloneNode(true) as HTMLPictureElement;
    const img = clone.querySelector("img")!;

    await forceLoad(clone, { sizes: "89vw" });

    expect(MockImage.requests).toEqual([
      "/photo.webp 500w, /photo-2x.webp 1000w",
    ]);
    expect(MockImage.sizes).toEqual(["89vw"]);
    expect(img.getAttribute("src")).toBe("/photo.webp");
    expect(img.classList.contains("img-progressive")).toBe(true);
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

  it("coalesces observed and forced picture loads", async () => {
    let intersectionCallback: IntersectionObserverCallback | undefined;

    class MockIntersectionObserver {
      constructor(callback: IntersectionObserverCallback) {
        intersectionCallback = callback;
      }

      disconnect = vi.fn();
      observe = vi.fn();
      unobserve = vi.fn();
    }

    vi.stubGlobal("IntersectionObserver", MockIntersectionObserver);
    document.body.innerHTML = `
      <picture>
        <source srcset="/preview.webp" data-src="/photo.webp">
        <img src="/preview.jpg" data-src="/fallback.jpg">
      </picture>
    `;
    const picture = document.querySelector("picture")!;
    setCurrentSrc(picture.querySelector("img")!, "/preview.webp");
    const cleanup = observe();

    intersectionCallback?.(
      [
        {
          isIntersecting: true,
          target: picture,
        } as unknown as IntersectionObserverEntry,
      ],
      {} as IntersectionObserver,
    );
    await forceLoad(picture);

    expect(MockImage.requests).toEqual(["/photo.webp"]);
    cleanup();
  });

  it("uses the fallback image when the active source fails", async () => {
    document.body.innerHTML = `
      <picture>
        <source
          srcset="/active-preview.webp"
          data-src="/fail-active.webp"
        >
        <img src="/fallback-preview.jpg" data-src="/fallback.jpg">
      </picture>
    `;
    const picture = document.querySelector("picture")!;
    setCurrentSrc(picture.querySelector("img")!, "/active-preview.webp");

    await forceLoad(picture);

    expect(MockImage.requests).toEqual(["/fail-active.webp", "/fallback.jpg"]);
    expect(picture.querySelector("img")?.getAttribute("src")).toBe(
      "/fallback.jpg",
    );
    expect(picture.querySelector("source")?.hasAttribute("srcset")).toBe(false);
    expect(picture.querySelector("source")?.hasAttribute("data-src")).toBe(
      false,
    );
  });

  it("does not guess among inactive sources", async () => {
    document.body.innerHTML = `
      <picture>
        <source srcset="/one-preview.webp" data-src="/one.webp">
        <source srcset="/two-preview.webp" data-src="/two.webp">
        <img src="/fallback-preview.jpg" data-src="/fallback.jpg">
      </picture>
    `;
    const picture = document.querySelector("picture")!;
    const img = picture.querySelector("img")!;
    Object.defineProperty(img, "complete", { configurable: true, value: true });

    await forceLoad(picture);

    expect(MockImage.requests).toEqual(["/fallback.jpg"]);
  });

  it("does not promote a standalone image after removal", async () => {
    class PendingImage extends MockImage {
      static instance: PendingImage;

      constructor() {
        super();
        PendingImage.instance = this;
      }

      set src(value: string) {
        MockImage.requests.push(value);
        this.currentSrc = value;
      }

      resolveLoad() {
        this.onload?.(new Event("load"));
      }
    }

    vi.stubGlobal("Image", PendingImage);
    document.body.innerHTML = '<img src="/preview.jpg" data-src="/photo.jpg">';
    const img = document.querySelector("img")!;
    const load = forceLoad(img);

    await vi.waitFor(() => expect(PendingImage.instance).toBeDefined());
    img.remove();
    document.body.append(img);
    PendingImage.instance.resolveLoad();
    await load;

    expect(img.classList.contains("img-progressive")).toBe(false);
    expect(img.dataset.src).toBe("/photo.jpg");
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

  it("reobserves a completed picture after reinsertion", async () => {
    const observed: Element[] = [];

    class MockIntersectionObserver {
      disconnect = vi.fn();
      observe = vi.fn((element: Element) => observed.push(element));
      unobserve = vi.fn();
    }

    vi.stubGlobal("IntersectionObserver", MockIntersectionObserver);
    vi.stubGlobal("Image", MockImage);
    document.body.innerHTML =
      '<picture><img src="/preview.jpg" data-src="/photo.jpg"></picture>';
    const picture = document.querySelector("picture")!;
    setCurrentSrc(picture.querySelector("img")!, "/preview.jpg");
    await forceLoad(picture);

    const cleanup = observe();
    picture.remove();
    await vi.waitFor(() => expect(observed).toHaveLength(0));
    document.body.append(picture);
    await vi.waitFor(() => expect(observed).toHaveLength(1));

    cleanup();
  });

  it("keeps observer lifecycles independent", () => {
    const observers: MockIntersectionObserver[] = [];

    class MockIntersectionObserver {
      constructor() {
        observers.push(this);
      }

      disconnect = vi.fn();
      observe = vi.fn();
      unobserve = vi.fn();
    }

    vi.stubGlobal("IntersectionObserver", MockIntersectionObserver);
    document.body.innerHTML = "<picture><img></picture>";

    const firstCleanup = observe();
    const secondCleanup = observe();

    firstCleanup();
    const picture = document.createElement("picture");
    picture.innerHTML = "<img>";
    document.body.append(picture);

    return vi
      .waitFor(() => expect(observers[1].observe).toHaveBeenCalledWith(picture))
      .then(() => {
        expect(
          observers[0].observe.mock.calls.some(
            ([element]) => element === picture,
          ),
        ).toBe(false);
        expect(secondCleanup).not.toThrow();
        secondCleanup();
      });
  });

  it("does not run stale observer completion after picture removal", async () => {
    const observed: Element[] = [];
    const unobserve = vi.fn();
    let intersectionCallback: IntersectionObserverCallback | undefined;

    class PendingImage extends MockImage {
      static instances: PendingImage[] = [];

      constructor() {
        super();
        PendingImage.instances.push(this);
      }

      set src(value: string) {
        MockImage.requests.push(value);
        this.currentSrc = value;
      }

      resolveLoad() {
        this.onload?.(new Event("load"));
      }
    }

    class MockIntersectionObserver {
      constructor(callback: IntersectionObserverCallback) {
        intersectionCallback = callback;
      }

      disconnect = vi.fn();
      observe = vi.fn((element: Element) => observed.push(element));
      unobserve = unobserve;
    }

    vi.stubGlobal("IntersectionObserver", MockIntersectionObserver);
    vi.stubGlobal("Image", PendingImage);
    document.body.innerHTML =
      '<picture><img src="/preview.jpg" data-src="/photo.jpg"></picture>';
    const picture = document.querySelector("picture")!;
    setCurrentSrc(picture.querySelector("img")!, "/preview.jpg");
    const cleanup = observe();

    intersectionCallback?.(
      [
        {
          isIntersecting: true,
          target: picture,
        } as unknown as IntersectionObserverEntry,
      ],
      {} as IntersectionObserver,
    );
    picture.remove();
    await vi.waitFor(() => expect(unobserve).toHaveBeenCalledWith(picture));
    const removalUnobserveCount = unobserve.mock.calls.length;
    PendingImage.instances[0].resolveLoad();

    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(
      picture.querySelector("img")?.classList.contains("img-progressive"),
    ).toBe(false);
    expect(unobserve).toHaveBeenCalledTimes(removalUnobserveCount);

    await new Promise((resolve) => setTimeout(resolve, 0));
    document.body.append(picture);
    await vi.waitFor(() => expect(observed).toHaveLength(2));
    const reload = forceLoad(picture);
    await vi.waitFor(() => expect(PendingImage.instances).toHaveLength(2));
    PendingImage.instances[1].resolveLoad();
    await reload;

    await vi.waitFor(() =>
      expect(
        picture.querySelector("img")?.classList.contains("img-progressive"),
      ).toBe(true),
    );

    cleanup();
  });

  it("does not promote an observer load after cleanup", async () => {
    let intersectionCallback: IntersectionObserverCallback | undefined;

    class PendingImage extends MockImage {
      static instance: PendingImage;

      constructor() {
        super();
        PendingImage.instance = this;
      }

      set src(value: string) {
        MockImage.requests.push(value);
        this.currentSrc = value;
      }

      resolveLoad() {
        this.onload?.(new Event("load"));
      }
    }

    class MockIntersectionObserver {
      constructor(callback: IntersectionObserverCallback) {
        intersectionCallback = callback;
      }

      disconnect = vi.fn();
      observe = vi.fn();
      unobserve = vi.fn();
    }

    vi.stubGlobal("IntersectionObserver", MockIntersectionObserver);
    vi.stubGlobal("Image", PendingImage);
    document.body.innerHTML =
      '<picture><img src="/preview.jpg" data-src="/photo.jpg"></picture>';
    const picture = document.querySelector("picture")!;
    const img = picture.querySelector("img")!;
    setCurrentSrc(img, "/preview.jpg");
    const cleanup = observe();

    intersectionCallback?.(
      [
        {
          isIntersecting: true,
          target: picture,
        } as unknown as IntersectionObserverEntry,
      ],
      {} as IntersectionObserver,
    );
    await vi.waitFor(() => expect(PendingImage.instance).toBeDefined());
    cleanup();
    PendingImage.instance.resolveLoad();

    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(img.classList.contains("img-progressive")).toBe(false);
    expect(img.dataset.src).toBe("/photo.jpg");
  });

  it("starts fresh loading after removal invalidates in-flight work", async () => {
    const observed: Element[] = [];
    let intersectionCallback: IntersectionObserverCallback | undefined;

    class PendingImage extends MockImage {
      static instances: PendingImage[] = [];

      constructor() {
        super();
        PendingImage.instances.push(this);
      }

      set src(value: string) {
        MockImage.requests.push(value);
        this.currentSrc = value;
      }

      resolveLoad() {
        this.onload?.(new Event("load"));
      }
    }

    class MockIntersectionObserver {
      constructor(callback: IntersectionObserverCallback) {
        intersectionCallback = callback;
      }

      disconnect = vi.fn();
      observe = vi.fn((element: Element) => observed.push(element));
      unobserve = vi.fn();
    }

    vi.stubGlobal("IntersectionObserver", MockIntersectionObserver);
    vi.stubGlobal("Image", PendingImage);
    document.body.innerHTML =
      '<picture><img src="/preview.jpg" data-src="/photo.jpg"></picture>';
    const picture = document.querySelector("picture")!;
    setCurrentSrc(picture.querySelector("img")!, "/preview.jpg");
    const cleanup = observe();

    intersectionCallback?.(
      [
        {
          isIntersecting: true,
          target: picture,
        } as unknown as IntersectionObserverEntry,
      ],
      {} as IntersectionObserver,
    );
    await vi.waitFor(() => expect(PendingImage.instances).toHaveLength(1));

    picture.remove();
    await vi.waitFor(() => expect(observed).toHaveLength(1));
    document.body.append(picture);
    await vi.waitFor(() => expect(observed).toHaveLength(2));

    intersectionCallback?.(
      [
        {
          isIntersecting: true,
          target: picture,
        } as unknown as IntersectionObserverEntry,
      ],
      {} as IntersectionObserver,
    );
    await vi.waitFor(() => expect(PendingImage.instances).toHaveLength(2));

    PendingImage.instances[0].resolveLoad();
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(
      picture.querySelector("img")?.classList.contains("img-progressive"),
    ).toBe(false);

    PendingImage.instances[1].resolveLoad();
    await vi.waitFor(() =>
      expect(
        picture.querySelector("img")?.classList.contains("img-progressive"),
      ).toBe(true),
    );
    cleanup();
  });

  it("ignores stale forceLoad completion after removal and reinsertion", async () => {
    const observed: Element[] = [];
    const unobserve = vi.fn();

    class PendingImage extends MockImage {
      static instances: PendingImage[] = [];

      constructor() {
        super();
        PendingImage.instances.push(this);
      }

      set src(value: string) {
        MockImage.requests.push(value);
        this.currentSrc = value;
      }

      resolveLoad() {
        this.onload?.(new Event("load"));
      }
    }

    class MockIntersectionObserver {
      disconnect = vi.fn();
      observe = vi.fn((element: Element) => observed.push(element));
      unobserve = unobserve;
    }

    vi.stubGlobal("IntersectionObserver", MockIntersectionObserver);
    vi.stubGlobal("Image", PendingImage);
    document.body.innerHTML =
      '<picture><img src="/preview.jpg" data-src="/photo.jpg"></picture>';
    const picture = document.querySelector("picture")!;
    const img = picture.querySelector("img")!;
    setCurrentSrc(img, "/preview.jpg");
    const cleanup = observe();

    const firstLoad = forceLoad(picture);
    await vi.waitFor(() => expect(PendingImage.instances).toHaveLength(1));
    picture.remove();
    await vi.waitFor(() => expect(unobserve).toHaveBeenCalledWith(picture));
    document.body.append(picture);
    await vi.waitFor(() => expect(observed).toHaveLength(2));

    const secondLoad = forceLoad(picture);
    await vi.waitFor(() => expect(PendingImage.instances).toHaveLength(2));
    PendingImage.instances[0].resolveLoad();
    await firstLoad;
    expect(img.classList.contains("img-progressive")).toBe(false);

    PendingImage.instances[1].resolveLoad();
    await secondLoad;
    expect(img.classList.contains("img-progressive")).toBe(true);
    cleanup();
  });
});
