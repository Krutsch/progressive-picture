const progressiveLoaded = new WeakSet<HTMLPictureElement | HTMLImageElement>();
const progressiveLoading = new WeakMap<
  HTMLPictureElement | HTMLImageElement,
  Promise<ProgressiveLoad | boolean>
>();
const progressiveGenerations = new WeakMap<
  HTMLPictureElement | HTMLImageElement,
  number
>();

type ProgressiveLoad = {
  element: HTMLPictureElement | HTMLImageElement;
  img: HTMLImageElement;
  highResolutionSrc: string;
  generation: number;
  failedSource?: HTMLSourceElement;
};

type ForceLoadOptions = {
  sizes?: string;
};

function observe() {
  let active = true;
  const observedPictures = new WeakMap<HTMLPictureElement, object>();

  const intersectionObserver = new IntersectionObserver((entries) => {
    for (const entry of entries) {
      if (
        !entry.isIntersecting ||
        !(entry.target instanceof HTMLPictureElement)
      ) {
        continue;
      }

      const picture = entry.target;
      if (!active || !picture.isConnected) continue;

      const token = observedPictures.get(picture);
      if (!token || progressiveLoaded.has(picture)) {
        if (progressiveLoaded.has(picture)) {
          intersectionObserver.unobserve(picture);
        }
        continue;
      }

      void loadProgressive(picture).then((loaded) => {
        if (
          !active ||
          !picture.isConnected ||
          observedPictures.get(picture) !== token ||
          !loaded
        ) {
          return;
        }

        if (loaded !== true) completeLoad(loaded);
        if (!progressiveLoaded.has(picture)) return;

        intersectionObserver.unobserve(picture);
        observedPictures.delete(picture);
      });
    }
  });

  const observePicture = (picture: HTMLPictureElement) => {
    if (
      !active ||
      observedPictures.has(picture) ||
      progressiveLoaded.has(picture)
    ) {
      return;
    }

    observedPictures.set(picture, {});
    intersectionObserver.observe(picture);
  };

  const forgetPicture = (picture: HTMLPictureElement) => {
    observedPictures.delete(picture);
    invalidateElement(picture);
    intersectionObserver.unobserve(picture);
  };

  visitPictures(document.body, observePicture);

  const mutationObserver = new MutationObserver((entries) => {
    for (const entry of entries) {
      for (const node of entry.removedNodes) {
        visitPictures(node, forgetPicture);
      }

      for (const node of entry.addedNodes) {
        visitPictures(node, observePicture);
      }
    }
  });

  mutationObserver.observe(document.body, { childList: true, subtree: true });

  return () => {
    active = false;
    intersectionObserver.disconnect();
    mutationObserver.disconnect();
  };
}

function forceLoad(
  element: HTMLImageElement | HTMLPictureElement,
  options: ForceLoadOptions = {},
): Promise<void> {
  const removalWatch = watchForRemoval(element);

  return loadProgressive(element, options)
    .then((loaded) => {
      removalWatch.flush();
      if (loaded !== true && loaded !== false) completeLoad(loaded);
    })
    .finally(removalWatch.stop);
}

function loadProgressive(
  element: HTMLImageElement | HTMLPictureElement,
  forceOptions?: ForceLoadOptions,
): Promise<ProgressiveLoad | true | false> {
  if (progressiveLoaded.has(element)) return Promise.resolve(true);

  const activeLoad = progressiveLoading.get(element);
  if (activeLoad) return activeLoad;

  const generation = currentGeneration(element);
  const load = (
    element instanceof HTMLPictureElement
      ? loadPicture(element, generation, forceOptions)
      : loadImage(element, generation)
  )
    .then((loaded) => {
      if (loaded === true && currentGeneration(element) === generation) {
        progressiveLoaded.add(element);
      }
      return loaded;
    })
    .finally(() => {
      if (progressiveLoading.get(element) === load) {
        progressiveLoading.delete(element);
      }
    });

  progressiveLoading.set(element, load);
  return load;
}

function currentGeneration(
  element: HTMLPictureElement | HTMLImageElement,
): number {
  return progressiveGenerations.get(element) ?? 0;
}

function invalidateElement(element: HTMLPictureElement | HTMLImageElement) {
  progressiveGenerations.set(element, currentGeneration(element) + 1);
  progressiveLoaded.delete(element);
  progressiveLoading.delete(element);
}

type RemovalWatch = {
  flush: () => void;
  stop: () => void;
};

function watchForRemoval(
  element: HTMLPictureElement | HTMLImageElement,
): RemovalWatch {
  const document = element.ownerDocument;
  let invalidated = false;

  const invalidateIfRemoved = (entries: MutationRecord[]) => {
    if (
      !invalidated &&
      entries.some((entry) =>
        Array.from(entry.removedNodes).some(
          (node) => node === element || node.contains(element),
        ),
      )
    ) {
      invalidated = true;
      invalidateElement(element);
      return true;
    }

    return false;
  };

  const mutationObserver = new MutationObserver((entries) => {
    if (invalidateIfRemoved(entries)) {
      mutationObserver.disconnect();
    }
  });

  mutationObserver.observe(document, { childList: true, subtree: true });
  return {
    flush: () => {
      if (invalidateIfRemoved(mutationObserver.takeRecords())) {
        mutationObserver.disconnect();
      }
    },
    stop: () => mutationObserver.disconnect(),
  };
}

async function loadPicture(
  picture: HTMLPictureElement,
  generation: number,
  forceOptions?: ForceLoadOptions,
) {
  const img = picture.querySelector("img");
  if (!img) return false;

  const sources = Array.from(
    picture.querySelectorAll<HTMLSourceElement>(
      forceOptions ? "source" : "source[data-src]",
    ),
  );
  if (!sources.length && !img.dataset.src) return true;

  const hasCurrentSource = picture.isConnected
    ? await waitForCurrentSource(img)
    : Boolean(img.currentSrc);
  const activeSource = hasCurrentSource
    ? sources.find((source) => sourceMatchesCurrentImage(source, img))
    : !picture.isConnected && sources.length === 1
      ? sources[0]
      : undefined;
  const candidates = [
    ...(activeSource ? [activeSource] : []),
    ...(img.dataset.src ? [img] : []),
  ];

  for (const candidate of candidates) {
    const highResolutionSrc = await preload(
      candidate,
      img,
      forceOptions?.sizes,
      Boolean(forceOptions),
    );
    if (!highResolutionSrc) continue;

    return {
      element: picture,
      img,
      highResolutionSrc,
      generation,
      failedSource: candidate === activeSource ? undefined : activeSource,
    };
  }

  return false;
}

async function loadImage(img: HTMLImageElement, generation: number) {
  if (!img.dataset.src) return true;

  const highResolutionSrc = await preload(img, img);
  if (!highResolutionSrc) return false;

  return { element: img, img, highResolutionSrc, generation };
}

function completeLoad(loaded: ProgressiveLoad) {
  if (
    progressiveLoaded.has(loaded.element) ||
    currentGeneration(loaded.element) !== loaded.generation
  ) {
    return;
  }

  if (loaded.element instanceof HTMLPictureElement) {
    promotePicture(
      loaded.element,
      loaded.img,
      loaded.highResolutionSrc,
      loaded.failedSource,
    );
  } else {
    loaded.img.src = loaded.highResolutionSrc;
    finishImage(loaded.img);
  }

  progressiveLoaded.add(loaded.element);
}

function waitForCurrentSource(img: HTMLImageElement): Promise<boolean> {
  if (img.currentSrc) return Promise.resolve(true);
  if (img.complete) return Promise.resolve(false);

  return new Promise((resolve) => {
    const finish = () => {
      img.removeEventListener("load", finish);
      img.removeEventListener("error", finish);
      resolve(Boolean(img.currentSrc));
    };

    img.addEventListener("load", finish);
    img.addEventListener("error", finish);
  });
}

function sourceMatchesCurrentImage(
  source: HTMLSourceElement,
  img: HTMLImageElement,
) {
  const currentSrc = normalizeUrl(img.currentSrc);

  return parseSrcset(source.srcset).some(
    (candidate) => normalizeUrl(candidate) === currentSrc,
  );
}

function parseSrcset(srcset: string) {
  return srcset
    .split(",")
    .map((candidate) => candidate.trim().split(/\s+/, 1)[0])
    .filter(Boolean);
}

function normalizeUrl(url: string) {
  try {
    return new URL(url, document.baseURI).href;
  } catch {
    return url;
  }
}

function preload(
  source: HTMLSourceElement | HTMLImageElement,
  img: HTMLImageElement,
  sizes?: string,
  usePromotedSource = false,
) {
  const dataSrc =
    source.dataset.src ??
    (usePromotedSource && source instanceof HTMLSourceElement
      ? source.srcset
      : undefined);
  if (!dataSrc) return Promise.resolve<string | false>(false);

  return new Promise<string | false>((resolve) => {
    const preloadedImage = new Image();
    preloadedImage.onload = () => resolve(preloadedImage.currentSrc || false);
    preloadedImage.onerror = () => resolve(false);

    if (source instanceof HTMLSourceElement) {
      preloadedImage.sizes = (sizes ?? source.sizes) || img.sizes;
      preloadedImage.srcset = dataSrc;
    } else {
      preloadedImage.src = dataSrc;
    }
  });
}

function promotePicture(
  picture: HTMLPictureElement,
  img: HTMLImageElement,
  highResolutionSrc: string,
  failedSource?: HTMLSourceElement,
) {
  for (const source of picture.querySelectorAll<HTMLSourceElement>(
    "source[data-src]",
  )) {
    if (source === failedSource) {
      source.removeAttribute("srcset");
      source.removeAttribute("data-src");
      continue;
    }

    source.srcset = source.dataset.src ?? source.srcset;
    source.removeAttribute("data-src");
  }

  img.src = highResolutionSrc;
  finishImage(img);
}

function finishImage(img: HTMLImageElement) {
  img.removeAttribute("data-src");
  img.classList.add("img-progressive");

  if (img.dataset.alt) {
    img.alt = img.dataset.alt;
    img.removeAttribute("data-alt");
  }
}

function visitPictures(
  node: Node,
  visit: (picture: HTMLPictureElement) => void,
) {
  if (node instanceof HTMLPictureElement) visit(node);

  if (node instanceof Element || node instanceof DocumentFragment) {
    for (const picture of node.querySelectorAll<HTMLPictureElement>(
      "picture",
    )) {
      visit(picture);
    }
  }
}

export { observe, forceLoad };
