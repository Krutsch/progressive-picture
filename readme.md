# Progressive Picture

> This 700 bytes (compressed) library enhances `Picture Elements` with Progressive Image Loading and thus improves the initial time of images being displayed.
> You can find out more from the [blog post](https://dev.to/fabkrut/enhancing-images-on-the-web-3b35).

## Installation and usage via npm

```bash
npm install progressive-picture
```

```ts
import { observe } from "progressive-picture";

const stopObserving = observe();

// Disconnect both DOM observers when the integration is torn down.
stopObserving();
```

## Installation and usage via Script Tag

```
<script type="module">
  import { observe } from "https://unpkg.com/progressive-picture";
  observe();
</script>
```

## Add the styles

```css
picture > img {
  display: block;
  max-width: 100%;
  height: auto;
  filter: blur(0);
  transition: filter 0.7s ease-in;
}
picture > img[data-src] {
  filter: blur(3px);
}
picture > img.img-progressive {
  width: auto;
}
```

or for mostly full-bleed images

```css
picture {
  @apply relative;

  & img {
    @apply block h-auto max-w-full;

    &.img-progressive {
      @apply w-auto;
    }
  }

  &::after {
    @apply pointer-events-none absolute inset-0 backdrop-blur-none duration-300 ease-in-out content-[""] motion-safe:transition-[backdrop-filter];
  }

  &:has(img[data-src])::after {
    @apply backdrop-blur-xs;
  }
}
```

## Example

```html
<picture>
  <source srcset="eu.preview.webp" data-src="eu.webp" type="image/webp" />
  <source srcset="eu.preview.jpg" data-src="eu.jpg" type="image/jpeg" />
  <img
    src="eu.preview.jpg"
    data-src="eu.jpg"
    loading="lazy"
    width="500"
    height="750"
    alt=""
    data-alt="Eukalyptus"
  />
</picture>
```

### Demo

https://lazy-load-picture.netlify.app/  
https://lazy-load-picture.netlify.app/masonry.html

## Usage

Set each `<source>` element's `srcset` and the `<img>` element's `src` to low-quality preview URLs. Put the matching high-quality URL or `srcset` in `data-src`. The library preloads the active high-quality source before replacing all preview attributes.

Use `data-alt` to defer alternative text until the high-quality image has loaded. The library moves its value to `alt` during replacement.

Call `forceLoad()` when an image must load without waiting for viewport intersection:

```ts
import { forceLoad } from "progressive-picture";

const picture = document.querySelector("picture");
if (picture) {
  await forceLoad(picture, { sizes: "89vw" });
}
```

`forceLoad()` accepts an `HTMLPictureElement` or `HTMLImageElement`. On preload failure, it leaves the preview intact.

For a picture, `forceLoad()` uses the browser's active source and does not probe inactive sources. If the active source cannot load, it tries the fallback image. Pass `sizes` when the forced rendering width differs from the picture's current layout. This also reselects an already promoted responsive source for the new width.

### Further Optimization

While this library is useful on the Web, optimizing the image correctly in the build step is the other side of the coin. This plugin [snowpack-plugin-sharp](https://www.npmjs.com/package/snowpack-plugin-sharp) could be helpful in this case.
