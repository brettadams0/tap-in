# Tap In: Design

Status: **approved 2026-10-02** with three changes, now folded in: more avatar customisation (§11), more fun while keeping readability first (§0, §13), and player-to-player reactions (§12).
Visual preview: [`design/styletile.html`](./design/styletile.html) (open it on your phone).

---

## 0. Priority order (this wins every argument)

1. **Readable.** You can read the prompt, your task, the timer and the result at arm's length in a dim bar, after a few drinks.
2. **Playable.** You know what to do right now and can do it with one thumb, quickly, without mistakes.
3. **Fun.** Personality, jokes, bursts, reactions.

When fun gets in the way of 1 or 2, fun loses. In practice:

**Screen zones.** Every play screen has four zones, and nothing decorative is allowed in the first three:

| Zone | Contains | Rule |
| --- | --- | --- |
| **Status** (top) | game, round, timer | always visible, never covered |
| **Content** (middle) | prompt, answers, results | solid surfaces only, no texture or motion behind text |
| **Action** (bottom third) | your buttons, plus the "Do this now" line | never covered, never moved while you're aiming |
| **Margin** (edges, gaps, the cap strip) | decoration, mascot, reactions | the only place fun is allowed to live while you're reading or acting |

**Motion budget.** While players are reading or answering:
- motion is limited to idle cap bobbing and the timer
- the big fun (slams, floods, confetti) happens **between** phases: title cards, reveals, Drink moments

**Text.** Prompt text never sits on patterns, never animates letter-by-letter, and never shrinks below the spec minimums to make room for decoration.

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

### Player colours (16 to choose from, one per player per room)

Red `#FF4D3D` · Tangerine `#FF8A3D` · Peach `#FFB38A` · Sunflower `#FFB81C` · Lemon `#FFEE55` · Volt `#D4FF3A` · Green `#4BD866` · Mint `#5FE0B7` · Aqua `#3ED6E0` · Sky `#6EC3FF` · Periwinkle `#8FA2FF` · Lilac `#C49BFF` · Orchid `#E07CFF` · Pink `#FF5FA8` · Bubblegum `#FFA6D2` · Foam `#F7ECD8`

- **Contrast:** dark ink (faces, initials) on every one of these colours is at least 5.7:1.
- **Colours are exclusive in a room:** a colour someone else has taken shows their mini-cap on the swatch, so no two players ever share one.
- **Never colour alone:** every player has a **colour + pattern + face + topper + name**, and in tight spots an initial is stamped on the cap.

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
| **Avatar** | a **bottle cap**: an SVG circle with 21 crimp teeth, built by the player (§11) | The face reacts to the game: it grimaces when that player has to drink, cheers when they win, and looks over at whoever just locked in. |
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

---

## 11. Avatar builder: "Build your cap"

Shown right after you enter your name (and from the lobby at any time by tapping your own cap). It's one screen: a big live preview of your cap on top and four tabs underneath, with no scrolling needed on a 360×640 screen.

| Tab | Options | Notes |
| --- | --- | --- |
| **Colour** | 16 colours (§2) | Colours other players have taken are marked with their mini-cap |
| **Pattern** | solid, stripes, polka, checker, starburst, swirl, split two-tone, sunrays (8) | A pattern uses the same colour one shade deeper, so the cap still reads as *your colour* from across the table, and the face stays readable on top |
| **Face** | eyes (10) × mouths (10) = 100 faces | Hand-drawn SVG parts: eyes like dots, hearts, stars, wink, sleepy, shades, spirals, side-eye, sparkle, big-anime; mouths like grin, smirk, tongue, O, fangs, whistle, wobbly, toothy, cat, kiss |
| **Topper** | none, party hat, crown, cowboy hat, beanie, flower, devil horns, halo, headphones, bow, chef hat, tiny umbrella drink (12) | Toppers sit *above* the cap, so they never cover the face |

- **🎲 Shuffle:** a big button that rolls a random combo. The cap spins on each roll.
- **Remembered:** your last cap is saved on this phone and preselected next time.
- **Edit time:** in the lobby and on the results screen, never mid-game (so a cap never changes while people are reading it).
- **Uniqueness:** if two players end up with the same face + pattern + topper, nothing breaks. Colour is unique, and the name is always shown.
- **Reduced motion:** no spin on Shuffle; a quick swap instead.

The 12 toppers also unlock fun moments for free. The crown goes on the round winner's cap for the next round, and the end-screen awards hand out special toppers: "Fastest thumbs" gets a lightning bolt. Earned toppers are **temporary** and float above your chosen one.

---

## 12. Reactions: send someone a little something

Tap any other player's cap in the **cap strip** (the row of caps along the bottom edge of the content zone, which is already on most screens). A small sheet slides up from the bottom with two tabs:

**Emoji (fixed, the 8 most-used, one tap):** 😂 ❤️ 🤣 👍 😭 🙏 😘 🔥

**Notes, three tabs: Kind · Funny · Glaze 🍩** ("Glaze" = laying on the compliments, and yes, it's properly flirty)
- Each tab shows **4 lines drawn at random** from a big pool (40+ per tab in `content/reactions.v1.json`). They're reshuffled every time the sheet opens, and a **🔀 New lines** button deals 4 more. Lines you've already sent this session are dealt last, so they stay fresh.
- Pool entries are tagged by spice like every bank: **Chill** gets cheesy-sweet glaze, and **Spicy/Unhinged** add bolder lines. Glaze is still held to the stranger-safety rules: no bodies or appearance, nothing about touching, meeting up, numbers or socials.

| Kind (samples) | Funny (samples) | Glaze (samples) |
| --- | --- | --- |
| "You're a legend." | "Absolute menace behaviour." | "Save me a seat next round 😉" |
| "Glad you're here!" | "Who let you cook?? 🍳" | "Are you the imposter? Because you stole my attention." |
| "Carry me, please." | "I'm reporting you to the fun police 🚨" | "Is it hot in here or is it just your answers? 🔥" |
| "You make this fun." | "Not you being the smartest one here." | "Losing to you doesn't even feel bad." |

**Where and when it shows (it never covers important content):**

- **Sending is only allowed when there's time:** lobby, waiting after you've locked in, reveals, someone-else-drinks moments, game outro, results. The cap strip simply isn't tappable while you still owe an answer, during title cards, during speed games (Reaction Shotgun, Tap Race, Countdown) and during your own Drink takeover.
- **On the receiving phone**, a note arrives as a **sticker in the margin zone**: it slaps onto the edge of the screen just above the cap strip, shows the sender's cap + the line, and peels off after 4 s. Tapping it dismisses it immediately. It is **never** a modal and never overlaps the status, content or action zones. Screens that allow reactions **reserve a 76px reaction lane** (two lines at the 18px body minimum) just above the cap strip (Capn's commentary uses it when it's empty), so a sticker never pushes or covers anything. At most one is shown at a time; extras queue.
- **If the receiver is busy** (answering, flash games, a Drink moment), the reaction **waits in a queue** and plays when they're free. Anything older than 20 s is dropped, so stale jokes don't land mid-game.
- **Everyone else's phones** see an emoji fly from the sender's cap to the receiver's cap in the cap strip (in the margin zone, about 600 ms). For notes, others just see a little 💌 fly (a 🍩 for Glaze, so the room knows someone's being glazed); the words stay private between the two of you. That's a fun tease, and nobody is embarrassed in front of the room.

**Safety and fairness (strangers, remember):**

- **Fixed lists only:** no free text, so nothing rude can be typed. Lines live in `content/reactions.v1.json`, validated like every other bank and held to the same stranger-safety rules: no appearance, body, or anything that implies touching or meeting up.
- **Rate limits** (server-enforced): 1 reaction every 3 s per sender, at most 4 per minute to the same person.
- **Mute:** tap a player's cap and choose **Mute** to block reactions from them. There's also a global "Reactions off" in your own menu, and the host can turn reactions off for the whole room in lobby settings.
- **Haptic and sound:** a soft "pop" with the sender's personal note, so you know who it's from without looking. No haptics during input phases.
- **Server path:** reactions go through the server for validation and the rate limit, are never stored, and are not part of game state.

---

## 13. The fun layer (inside the readability rules)

Fun that never costs readability:

- **Living caps:** caps idle-bob a few pixels, blink at random, glance toward whoever just locked in, and nervously sweat while their timer runs out (sweat drops sit in the margin around the cap).
- **Capn the commentator:** the mascot pops into the margin zone between phases with one-liners such as "Ooh, a tie. Spicy.", "That was fast. Suspiciously fast." and "Somebody's lying…". He never speaks during input phases.
- **Combo bursts:** two wins in a row adds a 🔥 topper; three gives "ON FIRE" stamped across your cap at the reveal.
- **Hype interstitials:** the 3 s title card gets a random sticker gag on top (e.g. "Stretch those thumbs", "Hydrate or die-drate"), always below the rule text.
- **Drink moment variety:** the flood has 4 variants (foam, fizz bubbles, confetti cannon, cap shower), so the 15th Drink still feels fresh. The word is always exactly **DRINK**.
- **Results screen as a party:** award stickers slap onto caps one by one, then the group photo: every cap in a row, with their earned toppers.
- **Easter eggs:** tapping Capn 5 times makes him burp a bubble. The lobby cap "bump" (tap your own cap) plays your note, so people will make songs in the lobby.

