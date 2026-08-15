# Progressive Picture Context

This context names image states and transitions handled by progressive-picture.

## Image States

**Picture**:
A responsive image made from source candidates and fallback image content.
_Avoid_: image service, gallery

**Preview**:
A lower-quality image shown while its high-resolution image is being prepared.
_Avoid_: placeholder, thumbnail

**High-resolution image**:
The image promoted after successful loading, replacing the preview state.
_Avoid_: full image, final asset

**Active source**:
Source candidate selected by browser responsive-image rules for current rendering conditions.
_Avoid_: first source, preferred source

## Transitions

**Progressive loading**:
Transition from preview to high-resolution image after high-resolution content loads successfully.
_Avoid_: image upgrade, lazy image load

**Forced loading**:
Progressive loading triggered directly instead of waiting for viewport visibility.
_Avoid_: eager loading, bypass loading
