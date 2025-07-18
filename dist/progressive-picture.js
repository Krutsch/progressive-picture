const progessiveLoaded = new WeakSet();
function observe() {
    const observer = new IntersectionObserver((entries) => {
        for (const entry of entries) {
            if (entry.intersectionRatio > 0 &&
                !progessiveLoaded.has(entry.target)) {
                const sources = entry.target.querySelectorAll("source");
                const img = entry.target.querySelector("img");
                if (!img)
                    break;
                preload(sources, "srcset", img).then((preloadedSource) => {
                    if (preloadedSource) {
                        progessiveLoaded.add(entry.target);
                        return; // source element is being used -> no need to preload <img>
                    }
                    preload([img], "src", img).then((preloadedImage) => preloadedImage &&
                        progessiveLoaded.add(entry.target));
                });
            }
        }
    });
    const pictures = iteratePictures(document.body);
    let current;
    while ((current = pictures.nextNode())) {
        observer.observe(current);
    }
    new MutationObserver((entries) => {
        for (const entry of entries) {
            for (const node of entry.addedNodes) {
                const pictures = iteratePictures(node);
                let current;
                while ((current = pictures.nextNode())) {
                    observer.observe(current);
                }
            }
            for (const node of entry.removedNodes) {
                const pictures = iteratePictures(node);
                let current;
                while ((current = pictures.nextNode())) {
                    observer.unobserve(current);
                    progessiveLoaded.delete(current);
                }
            }
        }
    }).observe(document.body, { childList: true, subtree: true });
    addEventListener("afterRouting", () => {
        //@ts-ignore
        if (window.isHMR) {
            for (const img of document.body.querySelectorAll("picture > img[data-src]")) {
                img.removeAttribute("data-src");
            }
        }
    });
}
async function forceLoad(img) {
    if (img instanceof HTMLPictureElement) {
        const sources = img.querySelectorAll("source");
        const imgElement = img.querySelector("img");
        if (!imgElement)
            return;
        const preloadedSource = await preload(sources, "srcset", imgElement);
        if (preloadedSource) {
            progessiveLoaded.add(img);
        }
        else {
            preload([imgElement], "src", imgElement).then((preloadedImage) => preloadedImage && progessiveLoaded.add(img));
        }
    }
    else if (img instanceof HTMLImageElement) {
        const preloadedSource = await preload([img], "src", img);
        if (preloadedSource)
            progessiveLoaded.add(img);
    }
}
async function preload(imgOrSrcs, src, img) {
    // Wait until image has been loaded
    if (!img.currentSrc) {
        await {
            then: (resolve) => (img.onload = resolve),
        };
    }
    for (const imgOrSrc of imgOrSrcs) {
        const currentSrc = img.currentSrc.split("/").pop();
        const maybeCurrentSrc = imgOrSrc.getAttribute(src)?.split("/").pop(); // Logic to find out which Source Element is being used
        // preload when data-src exists and when found the correct source element | fallback img
        if (imgOrSrc.dataset.src && currentSrc === maybeCurrentSrc) {
            if (imgOrSrc.dataset.src.includes(", ")) {
                // Cannot preload multiple images - try to add more source elements with media attribute.
            }
            else {
                const preload = new Image();
                preload.setAttribute(src, imgOrSrc.dataset.src);
                await {
                    then: (resolve) => (preload.onload = resolve),
                };
            }
            if (!imgOrSrc.dataset.src)
                continue;
            imgOrSrc.setAttribute(src, imgOrSrc.dataset.src);
            img.removeAttribute("data-src");
            // Remove attribute for any other source
            imgOrSrcs.forEach((imgOrSrc) => {
                if (imgOrSrc.dataset.src) {
                    imgOrSrc.setAttribute(src, imgOrSrc.dataset.src);
                    imgOrSrc.removeAttribute("data-src");
                }
            });
            img.classList.add("img-progressive");
            if (img.dataset.alt) {
                img.setAttribute("alt", img.dataset.alt);
                img.removeAttribute("data-alt");
            }
            return true;
        }
    }
}
function iteratePictures(node) {
    return document.createNodeIterator(node, NodeFilter.SHOW_ELEMENT, {
        acceptNode(elem) {
            return elem.localName === "picture"
                ? NodeFilter.FILTER_ACCEPT
                : NodeFilter.FILTER_REJECT;
        },
    });
}
export { observe, forceLoad };
