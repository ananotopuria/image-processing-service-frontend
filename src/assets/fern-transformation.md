# Hero artwork provenance

Asset: `fern-transformation.jpg` (1536 × 1024).

Created on 2026-09-28 for this project with OpenAI's built-in image generation tool. This is newly generated artwork, not a downloaded stock illustration or a reproduction of an existing plate. No reference image, screenshot, third-party artwork, or artist name was supplied. The asset is included for use and modification in this project; no third-party attribution requirement is attached to it. AI-generated provenance is recorded here rather than claiming public-domain status or exclusive copyright.

The generated PNG was converted to JPEG at quality 88 for delivery. The full composition is preserved. The hero displays it proportionally, with multiply blending against the existing cream background.

## Comparison derivative

`fern-transformation-optimized.jpg` is resized directly from the hero JPEG,
preserving the complete artwork and its 3:2 aspect ratio. No new artwork was
generated for the comparison. Reproduce it with macOS `sips` from the project root:

```sh
sips -z 512 768 -s format jpeg -s formatOptions 72 src/assets/fern-transformation.jpg --out src/assets/fern-transformation-optimized.jpg
```

| Asset | Dimensions | Format | Bytes | Displayed size |
| --- | --- | --- | --- | --- |
| Original / hero | 1536 × 1024 | JPEG | 491345 | 491.3 KB |
| Optimized | 768 × 512 | JPEG | 103170 | 103.2 KB |

Sizes use decimal KB (1,000 bytes), rounded to one decimal place. The optimized
file uses JPEG quality 72 and is about 79% smaller. The responsive comparison
previews fit their cards; their rendered sizes are not a pixel-for-pixel scale.
If either asset is regenerated, recheck its bytes and dimensions and update the
metadata in `src/pages/Home.tsx` and this table.

## Generation prompt

```text
Use case: stylized-concept
Asset type: original raster illustration for the right-hand figure of a vintage scientific image-processing website.
Primary request: an exquisite original natural-history engraving showing a fern transforming through three stages: a small tightly coiled fiddlehead on the left, a taller partially unfurled crozier in the middle, and an elegant fully opened arching fern frond on the right. Three separate botanical studies arranged as one balanced plate, progressing from compact to intricate, visibly connected by their shared botanical forms.
Style/medium: nineteenth-century copperplate botanical engraving, extremely fine detailed hatching and stippling, delicate vein details, slightly imperfect worn ink impressions, handmade scholarly specimen plate, sophisticated and visually interesting.
Composition: landscape 3:2 aspect ratio, all three specimens fully visible with comfortable whitespace margins on every side, no cropping. Largest open frond curves inward; airy composition with clear silhouettes legible at mobile size.
Color palette: monochrome charcoal ink only on a uniform light ivory background #f4f0e7. Subtle imperfections belong to the ink, no heavy paper grain or stains, no vignette or shadows.
Constraints: create entirely new artwork; no existing illustration, stock icon, photography, moth, border, arrows, lettering, numbers, watermark, or signature. Artwork only, not a website mockup.
```
