# Tap In: Design

Status: **proposal, waiting for approval.** No screens get built until this is signed off.
Visual preview: [`design/styletile.html`](./design/styletile.html) (open it on your phone).

---

## 1. The idea: "Bottle Cap Riot"

**Tap In is a riso-printed bar coaster that came to life.** Picture a stack of cheap screen-printed coasters, a fistful of bottle caps and an ink stamp, all on a dark bar top. Every tap *punches*. It leaves an ink stamp, pops a halftone burst, or flips a cap.

The name carries three meanings, and the design uses all of them:

| "Tap" means… | …so the design has |
| --- | --- |
| a finger tap | every press squashes, then bursts into halftone dots |
| a beer tap | foam, caps, bottles and the pour that floods the Drink screen |
| "tap in" (join the game) | ticket stubs and stamps for room codes, joining and locking in |

### Why this direction (and not the other two)

- **Neon dive-bar signage:** fits a dim room, but it's the most common "party game" look. Glowing text also blurs on cheap screens and is hard to read once people are tipsy.
- **Risograph zine on white:** has lots of character, but a white screen is a flashlight in a dark room.
- **Bottle Cap Riot** keeps the riso inks and print texture, sets them on a **dark bar top** (easy on eyes in a dim room), and gets its identity from physical objects (caps, coasters, stamps, tickets) rather than glow or gradients.

### Hard "don't" list (avoiding the AI-template look)

- **No gradients, ever.** Ink is flat. Depth comes from hard offset shadows (`4px 4px 0` in black), never blur.
- **No glassmorphism, no blur shadows, no purple-to-blue anything.**
- **Emoji are never the illustration.** Avatars, the mascot and icons are hand-built SVG. Emoji only appear inside player text.
- **No default component styling.** Every control is a sticker, a coaster, a cap or a ticket.

---

## 2. Palette

The dark bar top is the canvas, cream paper is the foreground, and each fluorescent ink has one job. Every ink below is **≥ 5.1:1** against the background, and dark text on an ink fill has the same ratio, so all pairs pass WCAG AA (most pass AAA).

### Base

| Token | Hex | Use |
| --- | --- | --- |
| `--stout` | `#15100D` | page background (a warm black, like a bar top at night) |
| `--stout-2` | `#241B16` | raised surfaces (coasters, cards) |
| `--ink` | `#15100D` | outlines (3px), text on ink fills, hard shadows |
| `--foam` | `#F7ECD8` | primary text, paper cards (16:1 on stout) |
| `--foam-dim` | `#B9A890` | secondary text, hints (8:1) |
| `--tap` | `#FF4D3D` | brand red: primary buttons, the logo, timer urgency, **Drink** |

### Game inks (each game owns one)

| Game | Ink | Hex | Title-card move |
| --- | --- | --- | --- |
| Would You Rather | Fluoro Pink | `#FF5FA8` | two coasters slam in from opposite sides and clack together |
| Rank It | Sunflower | `#FFB81C` | four tickets drop and stack 1-2-3-4 |
| Liar's Prompt | Mint | `#5FE0B7` | the title flips like a card, and the back reads slightly *different* |
| Two Truths, One App | Sky | `#6EC3FF` | three stickers deal in; one peels at the corner |
| Secret Word | Lilac | `#C49BFF` | a redaction bar wipes across, then tears off |
| Fake Answer | Tangerine | `#FF8A3D` | a card shuffle riffles and fans out |
| Reaction Shotgun | Volt | `#D4FF3A` | the title *strobes* once (a hard cut, which is the one allowed exception) |
| Tap Race | Tap Red | `#FF4D3D` | racing stripes zip through and the title skids in |
| Spin the Bottle | Bottle Green | `#4BD866` | the title rides in on a spinning bottle that stops on it |
| Fill in the Blank | Lemon | `#FFEE55` | the blank `____` underline draws itself, then words stamp onto it |
| Countdown | Electric Blue | `#8FA2FF` | 3-2-1 punches out like ticket numbers |

During a game, its ink fills the **header strip, the timer coaster and the primary button**, so you know which game you're in at a glance. Each game also shows its **name and icon**, so colour is never the only signal.

### Player colours (8 slots, fixed for the whole session)

Red `#FF4D3D` · Sunflower `#FFB81C` · Bottle Green `#4BD866` · Sky `#6EC3FF` · Fluoro Pink `#FF5FA8` · Tangerine `#FF8A3D` · Lilac `#C49BFF` · Foam `#F7ECD8`

A player is **never** identified by colour alone. Every player has a **cap colour + a face + their name**, and in tight spots an initial is stamped on the cap.

---

## 3. Type

| Role | Font | Why |
| --- | --- | --- |
| Display (titles, Drink, numbers, room codes) | **Bagel Fat One** (OFL) | Fat, round and a little squishy, like a sticker or a printed bar sign. It reads from across a table and works great at 120px. Not a font AI templates use. |
| Body (prompts, answers, UI) | **Atkinson Hyperlegible Next** (OFL) | Built by the Braille Institute for legibility, so every character is distinct (Il1, O0). That's exactly what a tipsy person in a dim room needs. |

- **Self-hosted** as woff2, subset to Latin, `font-display: swap`. About 60 KB total.
- **Display text gets misregistration:** a second copy offset `2px 2px` in the game ink sits behind the cream text. It looks like a slightly-off riso print. Used on titles only, never on body text.
- **Scale** (mobile, from the spec minimums up):

| Role | Size |
| --- | --- |
| body | 18px |
| buttons | 22px |
| answers | 24px |
| prompts | 30–34px |
| titles | 48–64px |
| **Drink** | 96–140px (fills the width) |

- **Numbers:** timers and counters use Bagel Fat One. Millisecond leaderboards use Atkinson with `tabular-nums` so the digits line up.

---

## 4. The building blocks

| Element | Looks like | Notes |
| --- | --- | --- |
| **Button** | a cream or ink sticker: 3px ink outline, `4px 4px 0` hard shadow, 18px radius, at least 64px tall | On press the shadow collapses (the sticker "presses into the table"), it squashes `scale(0.96, 0.92)` and pops a halftone burst. All of that happens on `pointerdown`, before any network call (well under 50 ms). |
| **Card / panel** | a coaster: a `--stout-2` rounded square, or a cream paper card with a slight ±1° tilt | Tilts are random but fixed per card, so it feels hand-placed |
| **Avatar** | a **bottle cap**: an SVG circle with 21 crimp teeth, in the player's colour, with a face inside | 12 hand-drawn faces (grin, smirk, shook, wink, sleepy, cool…), picked at join. The face reacts: it grimaces when that player has to drink and cheers when they win. |
| **Lock-in** | an **ink stamp** that thunks onto the player's cap: "IN!" in Bagel, rotated −8° to +8° | Everyone sees it land on that player's cap in the "4 of 5 locked in" row |
| **Timer** | a **coaster dial** (a ring that drains) with the seconds in Bagel | Last 5 s: the ring turns `--tap`, the number pulses on every second, and a tick sound plays, getting faster |
| **Room code** | a **raffle ticket stub** with a perforated edge and big Bagel letters | It appears on Create; the QR sits on the stub |
| **Header strip** | game ink + icon + name, "Round 2 of 4", and the timer | Always visible during play, together with a **"Do this now"** line above the action area |
| **Tap burst** | a cluster of 6–10 halftone dots in the current ink that scales out and fades in 300 ms | Fired on every tap. It's pooled DOM, transform/opacity only. |

**Layout rules:** portrait only. Header at the top. Prompt in the middle third. **Every primary action in the bottom third**, inside the safe area. Mute and the menu live in a fixed corner chip.

---

## 5. Motion principles

1. **Punch, don't float.** Things arrive fast (120–180 ms) with a springy overshoot (`stiffness 600, damping 22`), hold, then leave even faster (100 ms). No slow drifting ease-in-out.
2. **Things are physical.** Stickers slap, caps flip, stamps thunk, tickets tear. Everything has weight: a little squash on landing and a 1–2° settle wobble.
3. **Suspense is a stagger.** Reveals go one item at a time, 350–600 ms apart, building up to the hit. The last item waits a beat longer.
4. **The sync moment is sacred.** Reveal hits, the flash and the bottle stop all land on the server's `playAt`, on every phone, at the same frame.
5. **No hard cuts.** Every phase change is a transition (the one stylistic exception is Reaction Shotgun's strobe).
6. **Only `transform` and `opacity`** for animation, plus a single full-screen `clip-path` reveal for the Drink flood (it's GPU-composited on both engines; checked in phase 6 perf traces).
7. **Reduced motion:** every animation becomes a 150 ms crossfade, with no shake, no strobe and no flying. All information stays (who drank, the order of the reveal, the numbers).

### Signature moments

| Moment | Choreography |
| --- | --- |
| Lobby join | the cap drops in from above, bounces twice, spins to show its face, and the name pops under it with the player's note |
| Intro (synced) | the logo stamps down: "TAP" slams, "IN" slams, a foam burst, and every player's cap rolls across the screen and lines up |
| Title card | the per-game move from §2; holds about 2 s with the one-line rule, then wipes out in the game ink |
| Lock-in | the "IN!" stamp hits that player's cap; a small ink splat; the counter ticks |
| Timer, last 5 s | the dial goes red, pulses every second, and the screen edge gets a thin red vignette (opacity only) |
| Reveal | each card flips one by one, then the result **hit**: a big halftone burst + a 6px screen shake (no shake in reduced motion) |
| Would You Rather | caps fly along curved paths to their side, land and stack. The smaller pile wobbles nervously. |
| Tap Race | bars race up in sync, overshoot and settle. The lowest bar's cap gets dizzy eyes. |
| Spin the Bottle | the bottle spins with real deceleration (an exponential decay curve, with ~3–5 turns computed so it stops on the server's result) and a last "almost tips to the next player" wobble |
| Reaction Shotgun | a full-screen volt flash and the "TAP!" word. A fake-out is a **lilac** flash with "NOPE" in small letters (the colour, word *and* sound differ, so it isn't colour-only). |
| Fake Answer | cards deal from a deck with a 60 ms stagger, slide into a fan, then straighten into a list |

---

## 6. The Drink moment

The most important screen in the game. It says **only the word "Drink"**, never an amount and never "sip" or "shot". The copy rule is in the content linter.

### On the loser's phone ("You drink")

1. **0 ms:** everything else fades. The player's cap rises from the bottom of the screen.
2. **150 ms:** the cap **pops off** with a spin. A foam flood in the player's colour rises from the bottom and covers the screen, with a wobbly SVG wave crest.
3. **350 ms:** **DRINK** slams in, Bagel Fat One, 120px+, foam-cream with an ink outline and the riso double print, tilted −4°. The screen shakes for 400 ms, halftone confetti bursts, and the vibration pattern `[60, 40, 120]` fires on Android.
4. The player's name and cap sit under it. A big **"Done 🍺"** button is at the bottom (the emoji is decoration in the label, not the illustration).
5. If the fairness cap moved the drink here, a sticker on top says why: *"Saved by the 2-in-a-row rule. Sam's drinking for you!"* (shown on Sam's screen as "Taking one for the team").

Sound: the player's own signature "pop-glug" + the comedic **Drink horn**. It's loud and private, and only this phone plays it.

### On everyone else's phone ("Sam drinks")

A coaster slides in with Sam's cap wearing a small **DRINK** sticker that slaps on at an angle, plus "Sam" in Bagel. A soft glass *clink* plays. It's a smaller moment so the room focuses on the person drinking.

### "Everyone drinks"

The biggest moment. On every phone at the same `playAt`:

- the screen floods in **stripes of every player's colour**, rising in sequence like five pints filling at once
- **EVERYONE DRINK** stamps on in two lines
- every cap clinks together in the middle
- the shared group sting plays: a stacked chord built from every player's signature note, then a crash

### "Everyone except the imposter drinks"

The everyone-drinks flood plays, but the imposter's cap sits on top wearing sunglasses. The imposter's own phone gets a **"You got away with it"** smug moment instead.

### Nobody drinks ("perfectly balanced" / "lucky escape")

Two caps balance on a seesaw and level out. A soft "ahh" chord plays. "Nobody drinks" in Bagel.

---

## 7. Sound palette: "bar-top percussion"

Almost everything is **synthesised in the browser** with Web Audio (rendered to buffers once, then scheduled precisely), so it all sounds like objects on a bar.

| Family | Sounds | How |
| --- | --- | --- |
| **Glass** | lock-in clink, someone-else-drinks clink, Countdown ding | FM bell partials, short decay |
| **Cap and pop** | joins, tap bursts, the Drink pop | pitch-dropping sine + noise click |
| **Wood and coaster** | title-card slams, stamps, card deals | filtered noise thump + body resonance |
| **Brass (comedy)** | the **Drink horn**, the everyone-drinks sting | detuned saw stack with a lip bend down and vibrato: a sad trombone, but party |
| **Mechanics** | timer ticks (speeding up), bottle-spin whoosh + clunk, Reaction flash crack | noise sweeps, clicks |
| **Crowd** | winner cheer, Countdown celebration | 2–3 short **CC0 samples** (cheer, crowd "hey!"), credited in `CREDITS.md`, about 150 KB total |

- **Per-device signature:** each player slot gets a note from a C-major pentatonic scale (C D E G A c d e), so 8 players never clash. Each player also gets one of three timbre colourings: glass, wood or rubber. Your join pop, your lock-in clink and your Drink all use your note and timbre, so everyone learns whose phone just sounded.
- **Private sounds** (your secret role, your Drink) sit an octave lower and get a short "whisper" filter sweep. **Shared sounds** are brighter and drier.
- **Per-game stings:** each title card gets a 1-second sting built from that game's family. For example, the Liar's Prompt sting resolves on a *wrong* note, and Countdown's is three ticket punches.
- **Loudness:** shared sounds play at about −14 LUFS; "You drink" plays about 4 dB louder. A volume slider and mute are always one tap away, and mute is stored on the device.

---

## 8. Mascot: "Capn"

A dented bottle cap with big eyes. It shows up in empty states and transitions, never in the way of the game:

- spinning on the loading screen ("Pouring…")
- asleep on "This room has ended"
- holding a water glass for the water-break nudge
- peeking from the corner during the host's pause

It's drawn once in SVG with swappable eye and mouth parts, which also generates the 12 avatar faces.

---

## 9. Voice and copy

Short, cheeky, warm. It talks like the friend running the game, never like an app.

| Moment | Copy |
| --- | --- |
| Join button | **Tap In** |
| Waiting | "Waiting on 2 slowpokes…" |
| Locked in | "IN!" |
| Too close (Fake Answer) | "Too close, try again." (from the spec) |
| Water break | "Water break? Next round in 10s" (from the spec) |
| Silent switch notice | "iPhone on silent? Flip the switch to hear the game." |
| Room ended | "This room has ended. Last call was a while ago." + **Create New Room** |

Banned words in game copy: amounts, "sip", "shot", "chug", "finish your drink". The Drink instruction is only ever **Drink**.

---

## 10. Accessibility in a loud, dim room

- Dark background by default; all text pairs ≥ 4.5:1, and most ≥ 8:1.
- Tap targets ≥ 56px (buttons are 64px). Primary actions are in the bottom third.
- State is never shown by colour alone: icons, words, faces and patterns always go with it (e.g. a "reconnecting" cap is greyed **and** shows a plug icon **and** the word "reconnecting").
- `prefers-reduced-motion` is respected (§5.7).
- Rotating to landscape shows a friendly "rotate back" screen: Capn tipping over.
