const progressiveLoaded = new WeakSet();
const progressiveLoading = new WeakMap();
function observe() {
    const intersectionObserver = new IntersectionObserver((entries) => {
        for (const entry of entries) {
            if (entry.isIntersecting &&
                entry.target instanceof HTMLPictureElement &&
                !progressiveLoaded.has(entry.target)) {
                void loadProgressive(entry.target).then((loaded) => {
                    if (loaded)
                        intersectionObserver.unobserve(entry.target);
                });
            }
        }
    });
    visitPictures(document.body, (picture) => intersectionObserver.observe(picture));
    const mutationObserver = new MutationObserver((entries) => {
        for (const entry of entries) {
            for (const node of entry.addedNodes) {
                visitPictures(node, (picture) => intersectionObserver.observe(picture));
            }
            for (const node of entry.removedNodes) {
                visitPictures(node, (picture) => {
                    intersectionObserver.unobserve(picture);
                    progressiveLoaded.delete(picture);
                    progressiveLoading.delete(picture);
                });
            }
        }
    });
    mutationObserver.observe(document.body, { childList: true, subtree: true });
    return () => {
        intersectionObserver.disconnect();
        mutationObserver.disconnect();
    };
}
function forceLoad(element) {
    return loadProgressive(element).then(() => undefined);
}
function loadProgressive(element) {
    if (progressiveLoaded.has(element))
        return Promise.resolve(true);
    const activeLoad = progressiveLoading.get(element);
    if (activeLoad)
        return activeLoad;
    const load = (element instanceof HTMLPictureElement
        ? loadPicture(element)
        : loadImage(element))
        .then((loaded) => {
        if (loaded)
            progressiveLoaded.add(element);
        return loaded;
    })
        .finally(() => progressiveLoading.delete(element));
    progressiveLoading.set(element, load);
    return load;
}
async function loadPicture(picture) {
    const img = picture.querySelector("img");
    if (!img)
        return false;
    const sources = Array.from(picture.querySelectorAll("source[data-src]"));
    const hasCurrentSource = await waitForCurrentSource(img);
    const activeSource = hasCurrentSource
        ? sources.find((source) => sourceMatchesCurrentImage(source, img))
        : undefined;
    const candidate = activeSource ?? (img.dataset.src ? img : undefined);
    if (!candidate || !(await preload(candidate, img)))
        return false;
    promotePicture(picture, img);
    return true;
}
async function loadImage(img) {
    if (!img.dataset.src || !(await preload(img, img)))
        return false;
    img.src = img.dataset.src;
    finishImage(img);
    return true;
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
function preload(source, img) {
    const dataSrc = source.dataset.src;
    if (!dataSrc)
        return Promise.resolve(false);
    return new Promise((resolve) => {
        const preloadedImage = new Image();
        preloadedImage.onload = () => resolve(true);
        preloadedImage.onerror = () => resolve(false);
        if (source instanceof HTMLSourceElement) {
            preloadedImage.sizes = source.sizes || img.sizes;
            preloadedImage.srcset = dataSrc;
        }
        else {
            preloadedImage.src = dataSrc;
        }
    });
}
function promotePicture(picture, img) {
    for (const source of picture.querySelectorAll("source[data-src]")) {
        source.srcset = source.dataset.src ?? source.srcset;
        source.removeAttribute("data-src");
    }
    if (img.dataset.src)
        img.src = img.dataset.src;
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
