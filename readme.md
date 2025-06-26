# Progressive Picture

> This 700 bytes (compressed) library enhances `Picture Elements` with Progressive Image Loading and thus improves the initial time of images being displayed.
> You can find out more from the [blog post](https://dev.to/fabkrut/enhancing-images-on-the-web-3b35).

## Install via NPM

```
$ npm install progressive-picture
```

## Install via Script Tag

```
<script type="module" src="https://unpkg.com/progressive-picture"></script>
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

    & .img-progressive {
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
  <source srcset="eu.preview.jpg" data-src="eu.jpg" type="image/jpg" />
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

The `srcset` of `<source>` and the `src` of `<img>` has to be filled with the URI for the low-quality image (or in case of the `<source>` element: a `srcset` of low quality preview pictures. The data-src holds the high-quality image(s) and will be replaced once it has been loaded.  
Also, there is a data-alt Attribute that can be applied as alt, once the Image was replaced. This fixes the inelegance of displaying text before an image appears.

### Further Optimization

While this library is useful on the Web, optimizing the image correctly in the build step is the other side of the coin. This plugin [snowpack-plugin-sharp](https://www.npmjs.com/package/snowpack-plugin-sharp) could be helpful in this case.
