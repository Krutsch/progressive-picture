const css = document.createElement("style");
css.type = "text/css";
css.innerText =
  "picture { display: block; } picture > img { display: block; max-width: 100%; height: auto; filter: blur(0px); transition: filter 0.7s ease-in; } picture > img[data-src] { filter: blur(3px); } picture > img.img-progressive { width: auto; }";
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

        preload(sources, "srcset", img).then((preloadedSource) => {
          if (preloadedSource) {
            progessiveLoaded.add(entry.target as HTMLPictureElement);
            return; // source element is being used -> no need to preload <img>
          }

          preload([img], "src", img).then(
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
  original: HTMLImageElement
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
      if (img.dataset.src.includes(", ")) {
        img.setAttribute(source, img.dataset.src);
      } else {
        preload.src = img.dataset.src;
        await {
          then: (resolve: (_: HTMLImageElement) => Promise<HTMLImageElement>) =>
            (preload.onload = () => resolve(preload)),
        };
        img.setAttribute(source, preload.src);
      }

      original.classList.add("img-progressive");
      original.removeAttribute("data-src");
      elements.forEach((elem: HTMLSourceElement | HTMLImageElement) => {
        elem.setAttribute(source, elem.dataset.src!);
        elem.removeAttribute("data-src");
      });

      if (original.dataset.alt) {
        original.setAttribute("alt", original.dataset.alt);
        original.removeAttribute("data-alt");
      }
      return true;
    }
  }
}
