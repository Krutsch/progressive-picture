const progressiveLoaded = new WeakSet();
const progressiveLoading = new WeakMap();
const progressiveGenerations = new WeakMap();
function observe() {
    let active = true;
    const observedPictures = new WeakMap();
    const intersectionObserver = new IntersectionObserver((entries) => {
        for (const entry of entries) {
            if (!entry.isIntersecting ||
                !(entry.target instanceof HTMLPictureElement)) {
                continue;
            }
            const picture = entry.target;
            if (!active || !picture.isConnected)
                continue;
            const token = observedPictures.get(picture);
            if (!token || progressiveLoaded.has(picture)) {
                if (progressiveLoaded.has(picture)) {
                    intersectionObserver.unobserve(picture);
                }
                continue;
            }
            void loadProgressive(picture).then((loaded) => {
                if (!active ||
                    !picture.isConnected ||
                    observedPictures.get(picture) !== token ||
                    !loaded) {
                    return;
                }
                if (loaded !== true)
                    completeLoad(loaded);
                if (!progressiveLoaded.has(picture))
                    return;
                intersectionObserver.unobserve(picture);
                observedPictures.delete(picture);
            });
        }
    });
    const observePicture = (picture) => {
        if (!active ||
            observedPictures.has(picture) ||
            progressiveLoaded.has(picture)) {
            return;
        }
        observedPictures.set(picture, {});
        intersectionObserver.observe(picture);
    };
    const forgetPicture = (picture) => {
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
function forceLoad(element, options = {}) {
    const removalWatch = watchForRemoval(element);
    return loadProgressive(element, options)
        .then((loaded) => {
        removalWatch.flush();
        if (loaded !== true && loaded !== false)
            completeLoad(loaded);
    })
        .finally(removalWatch.stop);
}
function loadProgressive(element, forceOptions) {
    if (progressiveLoaded.has(element))
        return Promise.resolve(true);
    const activeLoad = progressiveLoading.get(element);
    if (activeLoad)
        return activeLoad;
    const generation = currentGeneration(element);
    const load = (element instanceof HTMLPictureElement
        ? loadPicture(element, generation, forceOptions)
        : loadImage(element, generation))
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
function currentGeneration(element) {
    return progressiveGenerations.get(element) ?? 0;
}
function invalidateElement(element) {
    progressiveGenerations.set(element, currentGeneration(element) + 1);
    progressiveLoaded.delete(element);
    progressiveLoading.delete(element);
}
function watchForRemoval(element) {
    const document = element.ownerDocument;
    let invalidated = false;
    const invalidateIfRemoved = (entries) => {
        if (!invalidated &&
            entries.some((entry) => Array.from(entry.removedNodes).some((node) => node === element || node.contains(element)))) {
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
async function loadPicture(picture, generation, forceOptions) {
    const img = picture.querySelector("img");
    if (!img)
        return false;
    const sources = Array.from(picture.querySelectorAll(forceOptions ? "source" : "source[data-src]"));
    if (!sources.length && !img.dataset.src)
        return true;
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
        const highResolutionSrc = await preload(candidate, img, forceOptions?.sizes, Boolean(forceOptions));
        if (!highResolutionSrc)
            continue;
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
async function loadImage(img, generation) {
    if (!img.dataset.src)
        return true;
    const highResolutionSrc = await preload(img, img);
    if (!highResolutionSrc)
        return false;
    return { element: img, img, highResolutionSrc, generation };
}
function completeLoad(loaded) {
    if (progressiveLoaded.has(loaded.element) ||
        currentGeneration(loaded.element) !== loaded.generation) {
        return;
    }
    if (loaded.element instanceof HTMLPictureElement) {
        promotePicture(loaded.element, loaded.img, loaded.highResolutionSrc, loaded.failedSource);
    }
    else {
        loaded.img.src = loaded.highResolutionSrc;
        finishImage(loaded.img);
    }
    progressiveLoaded.add(loaded.element);
}
function waitForCurrentSource(img) {
    if (img.currentSrc)
        return Promise.resolve(true);
    if (img.complete)
        return Promise.resolve(false);
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
function sourceMatchesCurrentImage(source, img) {
    const currentSrc = normalizeUrl(img.currentSrc);
    return parseSrcset(source.srcset).some((candidate) => normalizeUrl(candidate) === currentSrc);
}
function parseSrcset(srcset) {
    return srcset
        .split(",")
        .map((candidate) => candidate.trim().split(/\s+/, 1)[0])
        .filter(Boolean);
}
function normalizeUrl(url) {
    try {
        return new URL(url, document.baseURI).href;
    }
    catch {
        return url;
    }
}
function preload(source, img, sizes, usePromotedSource = false) {
    const dataSrc = source.dataset.src ??
        (usePromotedSource && source instanceof HTMLSourceElement
            ? source.srcset
            : undefined);
    if (!dataSrc)
        return Promise.resolve(false);
    return new Promise((resolve) => {
        const preloadedImage = new Image();
        preloadedImage.onload = () => resolve(preloadedImage.currentSrc || false);
        preloadedImage.onerror = () => resolve(false);
        if (source instanceof HTMLSourceElement) {
            preloadedImage.sizes = (sizes ?? source.sizes) || img.sizes;
            preloadedImage.srcset = dataSrc;
        }
        else {
            preloadedImage.src = dataSrc;
        }
    });
}
function promotePicture(picture, img, highResolutionSrc, failedSource) {
    for (const source of picture.querySelectorAll("source[data-src]")) {
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
function finishImage(img) {
    img.removeAttribute("data-src");
    img.classList.add("img-progressive");
    if (img.dataset.alt) {
        img.alt = img.dataset.alt;
        img.removeAttribute("data-alt");
    }
}
function visitPictures(node, visit) {
    if (node instanceof HTMLPictureElement)
        visit(node);
    if (node instanceof Element || node instanceof DocumentFragment) {
        for (const picture of node.querySelectorAll("picture")) {
            visit(picture);
        }
    }
}
export { observe, forceLoad };
