const css = document.createElement("style");
css.type = "text/css";
css.innerText =
  "picture { display: inline-block; } picture > img { display: block; max-width: 100%; height: auto; filter: blur(0px); transition: filter 0.7s ease-in; } picture > img[data-src] { filter: blur(3px); } picture > img.img-progressive { width: auto; }";
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

function isTextNode(node: Node) {
  return (node as Text).splitText !== void 0;
}

const DOMObserver = new MutationObserver((entries) => {
  for (const entry of entries) {
    for (const node of entry.addedNodes) {
      if (isTextNode(node)) break;

      const allNodes = (node as Element).querySelectorAll("*");
      allNodes.forEach((added) => {
        if (added instanceof HTMLPictureElement) {
          observer.observe(added);
        }
      });
    }
    for (const node of entry.removedNodes) {
      if (isTextNode(node)) break;

      const allNodes = (node as Element).querySelectorAll("*");
      allNodes.forEach((removed) => {
        if (removed instanceof HTMLPictureElement) {
          observer.unobserve(removed);
          progessiveLoaded.delete(removed);
        }
      });
    }
  }
}).observe(document.body, { childList: true, subtree: true });

const pictures = document.querySelectorAll("picture");
for (const picture of pictures) {
  observer.observe(picture);
}

async function preload(
  imagesOrSrcs: Array<HTMLImageElement> | NodeListOf<HTMLSourceElement>,
  src: string,
  img: HTMLImageElement
) {
  for (const imgOrSrc of imagesOrSrcs) {
    if (!img.currentSrc) {
      await {
        then: (resolve: (_: HTMLImageElement) => Promise<HTMLImageElement>) =>
          (img.onload = () => resolve(img)),
      };
    }
    const currentSrc = img.currentSrc.split("/").slice(-1)[0];
    const maybeCurrent = imgOrSrc.getAttribute(src)?.split("/").slice(-1)[0];

    // preload when data-src for img exists and when currentSrc matches the element
    if (imgOrSrc.dataset.src && currentSrc === maybeCurrent) {
      if (imgOrSrc.dataset.src.includes(", ")) {
        imgOrSrc.setAttribute(src, imgOrSrc.dataset.src);
        // cannot preload multiple images
      } else {
        const preload = new Image();
        preload.setAttribute(src, imgOrSrc.dataset.src);
        await {
          then: (resolve: (_: HTMLImageElement) => Promise<HTMLImageElement>) =>
            (preload.onload = () => resolve(preload)),
        };
        imgOrSrc.setAttribute(src, preload.getAttribute(src)!);
      }

      img.removeAttribute("data-src");
      imgOrSrc.removeAttribute("data-src");
      // remove attribute for any other imgOrSrc
      imagesOrSrcs.forEach((imgOrSrc: HTMLSourceElement | HTMLImageElement) => {
        if (imgOrSrc.dataset.src) {
          imgOrSrc.setAttribute(src, imgOrSrc.dataset.src!);
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
