# Progressive Picture

> This 787 bytes(compressed) library enhances Picture Elements with Progressive Image Loading and thus improves the initial time of images being displayed.

## Install via NPM

```
$ npm install progressive-picture
```

## Install via Script Tag

```
<script defer type="module" src="https://unpkg.com/progressive-picture"></script>
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

The `srcset` of `<source>` and the `src` of `<img>` has to be filled with the URI for the low-quality image(or in case of the `<source>` element: a `srcset` of low quality preview pictures. The data-src holds the high-quality image(s) and will be replaced once it has been loaded.  
Also, there is a data-alt Attribute that can be applied as alt, once the Image was replaced. This fixes the inelegance of displaying text before an image appears.

### Further

As shown in the example, this library works great in combination with native lazy loading. Tip: add width and height to fix layout shifts.
