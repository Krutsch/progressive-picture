const css = document.createElement("style");
css.type = "text/css";
css.innerText =
  "picture { display: inline-block; } picture > img { filter: blur(0px); transition: all 0.7s ease-in; } picture > img[data-src] { filter: blur(2px); }";
document.head.appendChild(css);

const progessiveLoaded = new WeakSet<HTMLPictureElement>();
const observer = new IntersectionObserver(
  (entries) => {
    for (const entry of entries) {
      if (
        entry.intersectionRatio > 0 &&
        !progessiveLoaded.has(entry.target as HTMLPictureElement)
      ) {
        const sources = entry.target.querySelectorAll("source");
        const img = entry.target.querySelector("img");
        if (!img) break;

        preload(sources, "srcset", img, false).then((preloadedSource) => {
          if (preloadedSource) {
            progessiveLoaded.add(entry.target as HTMLPictureElement);
            return; // source element is being used -> no need to preload <img>
          }

          preload([img], "src", img, true).then(
            (preloadedImage) =>
              preloadedImage &&
              progessiveLoaded.add(entry.target as HTMLPictureElement)
          );
        });
      }
    }
  },
  { rootMargin: "0px", threshold: 0.5 }
);

const DOMObserver = new MutationObserver((entries) => {
  for (const entry of entries) {
    for (const node of entry.addedNodes) {
      if (node instanceof HTMLPictureElement) {
        observer.observe(node);
      }
    }
    for (const node of entry.removedNodes) {
      if (node instanceof HTMLPictureElement) {
        observer.unobserve(node);
        progessiveLoaded.delete(node);
      }
    }
  }
}).observe(document.body, { childList: true, subtree: true });

const pictures = document.querySelectorAll("picture");
for (const picture of pictures) {
  observer.observe(picture);
}

async function preload(
  elements: Array<HTMLImageElement> | NodeListOf<HTMLSourceElement>,
  source: string,
  original: HTMLImageElement,
  alt: boolean
) {
  for (const img of elements) {
    const preload = new Image();
    if (!original.currentSrc) {
      await {
        then: (resolve: (_: HTMLImageElement) => Promise<HTMLImageElement>) =>
          (original.onload = () => resolve(original)),
      };
    }
    const current = original.currentSrc.split("/").slice(-1)[0];
    const sourceSrc = img.getAttribute(source)?.split("/").slice(-1)[0];

    // preload when data-src for img exists and when currentSrc matches the element
    if (img.dataset.src && current === sourceSrc) {
      preload.src = img.dataset.src;
      original.removeAttribute("data-src");
      elements.forEach((elem: HTMLSourceElement | HTMLImageElement) =>
        elem.removeAttribute("data-src")
      );

      await {
        then: (resolve: (_: HTMLImageElement) => Promise<HTMLImageElement>) =>
          (preload.onload = () => resolve(preload)),
      };
      img.setAttribute(source, preload.src);

      if (alt && img.dataset.alt) {
        img.setAttribute("alt", img.dataset.alt);
        img.removeAttribute("data-alt");
      }
      return true;
    }
  }
}
