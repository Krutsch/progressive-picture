const css=document.createElement("style");css.type="text/css",css.innerText="picture { display: block; } picture > img { display: block; max-width: 100%; height: auto; filter: blur(0px); transition: filter 0.7s ease-in; } picture > img[data-src] { filter: blur(3px); } picture > img.img-progressive { width: auto; }",document.head.appendChild(css);const progessiveLoaded=new WeakSet(),observer=new IntersectionObserver(d=>{for(const c of d)if(c.intersectionRatio>0&&!progessiveLoaded.has(c.target)){const a=c.target.querySelectorAll("source"),e=c.target.querySelector("img");if(!e)break;preload(a,"srcset",e).then(b=>{if(b){progessiveLoaded.add(c.target);return}preload([e],"src",e).then(g=>g&&progessiveLoaded.add(c.target))})}},{rootMargin:"0px",threshold:.5});function isTextNode(d){return d.splitText!==void 0}const DOMObserver=new MutationObserver(d=>{for(const c of d){for(const a of c.addedNodes){if(isTextNode(a))break;const e=a.querySelectorAll("*");e.forEach(b=>{b instanceof HTMLPictureElement&&observer.observe(b)})}for(const a of c.removedNodes){if(isTextNode(a))break;const e=a.querySelectorAll("*");e.forEach(b=>{b instanceof HTMLPictureElement&&(observer.unobserve(b),progessiveLoaded.delete(b))})}}}).observe(document.body,{childList:!0,subtree:!0}),pictures=document.querySelectorAll("picture");for(const d of pictures)observer.observe(d);async function preload(d,c,a){var e;for(const b of d){a.currentSrc||await{then:f=>a.onload=()=>f(a)};const g=a.currentSrc.split("/").slice(-1)[0],h=(e=b.getAttribute(c))==null?void 0:e.split("/").slice(-1)[0];if(b.dataset.src&&g===h){if(b.dataset.src.includes(", "))b.setAttribute(c,b.dataset.src);else{const f=new Image();f.setAttribute(c,b.dataset.src),await{then:i=>f.onload=()=>i(f)},b.setAttribute(c,b.dataset.src)}return a.removeAttribute("data-src"),b.removeAttribute("data-src"),d.forEach(f=>{f.dataset.src&&(f.setAttribute(c,f.dataset.src),f.removeAttribute("data-src"))}),a.classList.add("img-progressive"),a.dataset.alt&&(a.setAttribute("alt",a.dataset.alt),a.removeAttribute("data-alt")),!0}}}
