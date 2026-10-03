# Promo shots

Real five-phone rounds on the local build, captured by `apps/web/e2e/promo.spec.ts` (Pixel-sized Chromium, 1082×2202). The lobby shows the live address and the last-5-seconds red edge is hidden; everything else is exactly what players see.

- `hero.png`: a wide banner (Would You Rather title card, the vote, a Drink, Liar's Prompt answers, Tap Race, the Fill in the Blank reveal).
- `screens/`: 19 shots, numbered in the order they happen in a night.

Re-take the screens after a visual change (see VERIFY.md), then rebuild the banner with ImageMagick 6:

```bash
cd promo
montage screens/03-title-wyr.png screens/04-wyr-vote.png screens/06-drink-you.png \
  screens/10-liar-show.png screens/16-taprace.png screens/13-blank-reveal.png \
  -tile 6x1 -geometry +28+28 -background '#1b1716' /tmp/row.png
convert /tmp/row.png -background '#1b1716' -gravity north -splice 0x240 \
  -font DejaVu-Sans-Bold -pointsize 130 -fill '#ff5a4a' -annotate +0+50 'TAP IN!' \
  -gravity south -splice 0x170 -font DejaVu-Sans -pointsize 56 -fill '#f4ead8' \
  -annotate +0+55 "The party game that lives on everyone's phone  ·  3–8 players  ·  no app  ·  tap-in-omega.vercel.app" \
  -resize 50% hero.png
```
