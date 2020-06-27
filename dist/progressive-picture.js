const css = document.createElement("style");
(css.type = "text/css"),
  (css.innerText =
    "picture { display: inline-block; } picture > img { filter: blur(0px); transition: all 0.7s ease-in; } picture > img[data-src] { filter: blur(2px); }"),
  document.head.appendChild(css);
const progessiveLoaded = new WeakSet(),
  observer = new IntersectionObserver(
    (d) => {
      for (const b of d)
        if (b.intersectionRatio > 0 && !progessiveLoaded.has(b.target)) {
          const a = b.target.querySelectorAll("source"),
            e = b.target.querySelector("img");
          if (!e) break;
          preload(a, "srcset", e, !1).then((h) => {
            if (h) {
              progessiveLoaded.add(b.target);
              return;
            }
            preload([e], "src", e, !0).then(
              (c) => c && progessiveLoaded.add(b.target)
            );
          });
        }
    },
    { rootMargin: "0px", threshold: 0.5 }
  ),
  DOMObserver = new MutationObserver((d) => {
    for (const b of d) {
      for (const a of b.addedNodes)
        a instanceof HTMLPictureElement && observer.observe(a);
      for (const a of b.removedNodes)
        a instanceof HTMLPictureElement &&
          (observer.unobserve(a), progessiveLoaded.delete(a));
    }
  }).observe(document.body, { childList: !0, subtree: !0 }),
  pictures = document.querySelectorAll("picture");
for (const d of pictures) observer.observe(d);
async function preload(d, b, a, e) {
  var h;
  for (const c of d) {
    const g = new Image();
    a.currentSrc || (await { then: (f) => (a.onload = () => f(a)) });
    const i = a.currentSrc.split("/").slice(-1)[0],
      j = (h = c.getAttribute(b)) == null ? void 0 : h.split("/").slice(-1)[0];
    if (c.dataset.src && i === j)
      return (
        (g.src = c.dataset.src),
        a.removeAttribute("data-src"),
        d.forEach((f) => f.removeAttribute("data-src")),
        await { then: (f) => (g.onload = () => f(g)) },
        c.setAttribute(b, g.src),
        e &&
          c.dataset.alt &&
          (c.setAttribute("alt", c.dataset.alt), c.removeAttribute("data-alt")),
        !0
      );
  }
}
