# Jewel beetle artwork

Created for this project on 2026-09-28 using OpenAI's built-in image generation tool. Original AI-generated artwork with no third-party reference image, screenshot, stock illustration, or artist name supplied. Included for use and modification in this project. No third-party attribution requirement is attached; this records provenance without claiming exclusive copyright or public-domain status.

The image is a decorative imagined entomological specimen, not a taxonomic reference.

## Assets and processing

| Asset | Dimensions | Format | Bytes | Displayed size |
| --- | --- | --- | --- | --- |
| jewel-beetle.jpg | 1536 × 1024 | JPEG | 461769 | 461.8 KB |
| jewel-beetle-optimized.jpg | 768 × 512 | JPEG | 93595 | 93.6 KB |

The generated PNG was converted to JPEG at quality 88 using macOS sips. The smaller image was derived directly from that JPEG, preserving the complete composition:

```sh
sips -z 512 768 -s format jpeg -s formatOptions 72 src/assets/jewel-beetle.jpg --out src/assets/jewel-beetle-optimized.jpg
```

The hero uses `jewel-beetle-transparent.png`, a 1536 × 1024 RGBA edit created with the built-in image tool from `jewel-beetle.jpg`. Its genuine alpha channel is preserved, with fully transparent corners and background pixels. It displays directly on the page without CSS blend-mode simulation. The JPEGs are retained as source/unused variants; the comparison cards use the fern artwork documented in `fern-transformation.md`. Sizes use decimal KB (1,000 bytes), rounded to one decimal place.

## Transparency edit prompt

```text
Use case: background-extraction.
Edit target: the supplied original emerald-and-bronze jewel beetle engraving.
Remove the entire cream paper background and deliver a PNG with a genuine transparent alpha channel. Preserve the beetle's exact shape, pose, emerald and teal shell colors, bronze accents, fine engraved details, antennae, slender legs, and complete spread amber wings. Keep the same landscape 1536 by 1024 canvas, margins, framing and scale. All empty space outside the insect and between legs and antennae must be fully transparent. Retain subtle translucency of the amber wing membranes with clear detailed veins. No cream or white rectangle, paper grain, shadow, matte halo, border or checkerboard painted into the image. Actual transparent pixels, not a picture of transparency. Do not add objects, text or change the artwork's style.
```

## Original generation prompt

```text
Use case: stylized-concept
Asset type: original natural-history specimen artwork for a vintage scientific website hero, landscape 1536 by 1024.
Subject: a single magnificent jewel beetle viewed directly from above, in a poised museum specimen arrangement. Its two hard emerald wing cases open slightly outward, revealing two delicate translucent amber flying wings spread widely underneath. Exactly six slender jointed legs and two fine antennae. A compact beautiful beetle body, intricately engraved shell and wing venation. The outspread silhouette should be broad and balanced, evoking transformation and discovery.
Style: exquisite nineteenth-century hand-colored copperplate entomological engraving, fine charcoal outlines, intricate crosshatching and stippling, subtle uneven printed ink, restrained watercolor washes in muted malachite emerald, deep petrol teal, and antique bronze with pale amber wings. Colorful enough to be memorable while sophisticated and archival, never neon, glossy 3D, cartoon, or stock icon.
Composition: one large centered specimen, dorsal view, fully visible antennae, legs, and wing tips. Landscape 3:2 image with generous 9 percent whitespace margins on every side. No extra insects or botanical elements.
Background: flat uniform warm ivory #f4f0e7, no dark vignette, shadows, stains, frame, or heavy texture. Slight imperfections are in the ink.
Constraints: newly invented original illustration, not a copy of an existing plate. Artwork only, no website mockup, no text, labels, signature, watermark, or border.
```
