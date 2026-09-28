# Sign-in life-stage illustration

Active asset: `moth-life-stages-transparent.png`, 1024 × 1536, RGBA PNG with genuine transparency. The earlier `moth-life-stages.jpg` is retained as the source for this edit.

Original illustration created for this project on 2026-09-28 using OpenAI's built-in image generation tool, following the user's written description of an antique natural-history plate. No reference attachment was available to the assistant; no existing plate or screenshot was copied or embedded. This is a decorative specimen study, not an authoritative taxonomic illustration.

The initial generated PNG was converted to JPEG at quality 88 with macOS sips. The built-in image tool then edited that JPEG to remove its paper background. The resulting RGBA PNG is used directly, preserving its alpha channel. Pixel inspection verified 1,023,466 fully transparent pixels out of 1,572,864, including the corners, with partial alpha for fine ink details. No cropping was applied. The sign-in panel displays the complete image proportionally between its figure label and caption without CSS blend-mode simulation. Below the desktop breakpoint, a compact version follows the sign-in form to keep account access first. Registration retains its existing artwork.

## Transparency edit prompt

```text
Use case: background-extraction.
Edit target: the supplied original moth life-stage illustration.
Remove ALL cream paper background and deliver a PNG with a genuine transparent alpha channel. Preserve the same three specimens, exact vertical arrangement, fine sepia and charcoal engraving, shapes, subtle shading, delicate hairs and antennae. Preserve the full portrait 1024 by 1536 canvas, all margins, and entire silhouettes. Render only the engraved ink marks: the blank spaces between specimens and the uninked light areas inside the wings and bodies should be transparent, so the host webpage's cream color shows through. No opaque white or cream backing, no paper texture, no shadow, no border, no checkerboard painted into the image. Actual transparent pixels, not a picture of transparency. Do not introduce text or new objects.
```

## Original generation prompt

```text
Use case: stylized-concept
Asset type: original vertical natural-history plate illustration for the left panel of a vintage sign-in page. Portrait 1024 by 1536.
Subject and composition: exactly three separate specimens of the life stages of a moth, composed vertically as a scholarly entomological study with generous clear separation. Upper half: one richly detailed adult moth viewed from above with symmetrical spread wings and feathered antennae, fully visible. Middle: one gently curved caterpillar in side view with delicately engraved segments, tiny feet and subtle hairs. Lower: one elongated chrysalis/pupa with its segmented shell clearly rendered, oriented vertically and slightly tilted. The caterpillar and chrysalis are smaller than the adult moth. Airy margins, all three specimens fully inside the frame.
Style: original antique natural history copperplate engraving from an old scientific book; extremely fine engraved linework, crosshatching, stippling, subtle shading, slightly imperfect ink impressions. Muted charcoal-black and warm sepia ink only on uniform warm cream paper #f4f0e7. No vivid color. Refined and authentic printed-ink appearance, not clip art, not photography, not 3D.
Constraints: create new artwork, do not reproduce an existing plate. No words, letters, labels, numbers, caption, frame, signature, watermark, arrows or diagram lines. No foliage or extra specimens. No shadows, vignette, stains or heavily distressed paper. The entire silhouette of every specimen must be preserved. Artwork only, no page mockup.
```
