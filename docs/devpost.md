# Pac-Manhattan: Devpost write-up

**Title:** Pac-Manhattan

**Tagline (under 200 characters):** You're the ghost. New York is the maze. A 3D arcade chase through real NYC streets that teaches you the city one riddle at a time.

**Track:** Know Your City
**Also submit to:** Best Use of Tiger Data, Best Use of MongoDB Atlas, Best Use of Gemini API, Best Use of ElevenLabs, Best .Tech Domain Name, Most Popular Hack. Tiger and Mongo are in the code. The game still needs `TIGER_DATABASE_URL` and `MONGODB_URI` set in Vercel (they are not in the repo). Until then scores stay in the browser and the Tiger panel stays hidden.

**Images:** `docs/media/pacmanhattan-cover-3x2.jpg` (3000x2000, Devpost thumbnail and first gallery image) and `docs/media/pacmanhattan-banner-3x1.jpg` (3840x1280, wide banner). Both are real screenshots of the game's title screen.

**Try it:** https://pac-manhattan.tech (backup: https://pacmanhattan-kappa.vercel.app)
**Code:** https://github.com/Vorld/pacmanhattan

---

## Inspiration

**New Yorkers live in borough bubbles.** 86% of New Yorkers who moved stayed in the same borough ([StreetEasy, via amNY](https://www.amny.com/news/most-new-yorkers-who-move-stay-in-their-boroughs-report-finds-1.12449875/)). We ride the same train to the same few blocks, and the rest of the city stays a name on a subway map.

**We don't even see our own landmarks.** In a survey of 2,000 Americans, 1 in 4 had never been to the biggest attraction in their own city, and 55% said they want to visit a local landmark but haven't ([OnePoll for Zipcar](https://www.foxnews.com/travel/25-percent-of-americans-havent-visited-iconic-landmarks-in-their-own-cities-study-finds)).

**And we've handed our sense of direction to our phones.** People with more lifetime GPS use have worse spatial memory when they navigate on their own, and heavier GPS use over three years went with a steeper decline in hippocampus-dependent spatial memory ([Dahmani & Bohbot, *Scientific Reports*, 2020](https://www.nature.com/articles/s41598-020-62877-0)). A navigation game played by 397,162 people in 38 countries found that people navigate best in street layouts like the ones they grew up in ([Coutrot et al., *Nature*, 2022](https://www.nature.com/articles/s41586-022-04486-7)). Your mental map is shaped by the streets you actually walk.

Meanwhile, New York drew **65 million visitors in 2025** ([NYC Tourism + Conventions](https://www.business.nyctourism.com/press-media/press-releases/NYC-Tourism-Annual-Report-March-2026)), and most of them, like most of us, see the same handful of blocks.

**Games can move people.** Pokémon Go's most engaged players walked 1,473 more steps a day, over a 25% jump ([Althoff et al., *JMIR*, 2016](https://www.jmir.org/2016/12/e315/)). So we asked: what if the game board were the real map of New York, and every run left you knowing where things actually are?

## What it does

Pac-Manhattan flips Pac-Man. **You're the ghost**, and hungry chompers hunt you through real New York streets in 3D.

- **Solve a riddle, find the place.** Each task is a riddle about a real spot ("Simon and Garfunkel sang of this cantilever path spanning the East River..."). Figure it out before the name is revealed for a 50% bonus. The name appears after 30 seconds, at a landmark, or when you press R.
- **Themed runs.** Type "food spots" or "a first date in Brooklyn" and Gemini picks that run's places, only from the places in the game. Judges can type their own.
- **Visit ★ landmarks** for a card with an HD photo, a fun fact, a Wikipedia summary, and a hint with the target's walking distance and direction. Every place you reach is stamped in your **Passport**.
- **Dodge three kinds of chompers.** Chomps chases you, Sneaky cuts you off on the way to your target, and Snooze wanders until you get close. A new one joins after every task.
- **Seven maps:** all of Manhattan; neighborhoods of Brooklyn, Queens, the Bronx and Staten Island; Manhattan + Brooklyn over the East River bridges; and **all five boroughs on one map**, joined by the Brooklyn, Manhattan, Williamsburg, Queensboro, Macombs Dam and Third Avenue Bridges, and the **Staten Island Ferry**. The ferry carries you five times faster than running, and chompers can't swim, so they wait at the terminal.
- **A real city, in real colors.** 171,710 buildings at their real heights. Roof colors come from NYC's 2018 aerial photos, and wall colors from each lot's year built and building class, so Brooklyn shows brownstone and red brick and Midtown shows glass and limestone.
- **Know the block.** Every place card shows the streets around it, live from a 767,563-building NYC database: "151 buildings within a block or two, typically built around 1879; the oldest dates to 1819."
- **Riddle stats.** After you solve a riddle, you see how everyone else did: "12 of 17 finds solved this riddle before the name appeared, in 41 s on average."
- **A postcard from your run.** When you get caught, Gemini writes a funny recap from what actually happened ("You barely left One Court Square before Chomps tagged you on Jackson Avenue"), checked against the run's facts, and the narrator reads it aloud.
- **A narrator** cheers you on, warns you when a chomper is behind you, and calls out every bridge you cross.
- **2-player split screen:** race a friend to the same places on one keyboard.
- **A live title screen:** the game plays itself behind the menu, so you see what it is before you read a word.

## How we built it

- **Game:** Three.js with plain HTML and JavaScript, no build step. Movement snaps to a real street graph, and chompers use A* pathfinding. Buildings are built in chunks near the camera with per-vertex colors, and a see-through shader keeps the ghost visible behind skyscrapers.
- **Map data pipeline (Python, Shapely):** OpenStreetMap streets, parks, water, buildings and coastline via the Overpass API, turned into a routable graph per borough. Brooklyn and Queens sit on Long Island, so we used NYC's shoreline-clipped neighborhood boundaries (NTA 2020) for their land.
- **All five boroughs on one map:** every borough is reprojected into Manhattan's frame (rotated 29° so avenues run up the screen), and the street graphs are joined at the real landing points of each bridge. The ferry is its own kind of edge, which pathfinding lets you use and never lets chompers use.
- **Real building colors:** about 3,000 NYC aerial photo tiles, sampled at up to 10 points inside each footprint for the roof color. NYC PLUTO lots are matched to footprints with a spatial index for wall materials.
- **Gemini API** (Gemini 3.1 Flash-Lite) writes a riddle for every place from that place's own fact and Wikipedia summary. Every riddle goes through a checker before we keep it: it can't use any word of the place's name, and every number in it has to appear in the source text, so Gemini can't invent a year. Failed riddles get up to three retries with the reason.
- **Tiger Data** (TimescaleDB) powers the live panel on every place card. We load 767,563 NYC buildings (PLUTO lots joined with HPD data) and query the ones around each place by coordinate. Every riddle outcome (solved before the reveal, found after, revealed, caught) is written to a **hypertable**, and a **real-time continuous aggregate** rolls it up into each place's solve rate and average solve time. The connection string (`TIGER_DATABASE_URL`) is not set yet, so the panel is hidden until it is.
- **MongoDB Atlas** stores each player's high scores, Passport stamps and finished runs through Vercel functions, so the leaderboard is global, with a browser fallback when the database is unreachable. `MONGODB_URI` is not set yet, so saves stay in the browser until it is.
- **ElevenLabs** (Multilingual v2, voice "Laura") recorded 16 narrator lines at build time, so the game ships plain audio files and no API key ever reaches the browser.
- **Grok in Cursor** writes the on-screen lesson after you find one of eight places (the High Line, Inwood Hill Park, the ferry terminal, the Brooklyn Bridge, Little Island, the Battery, Katz's, Sheep Meadow), plus a toast on the ferry and the Brooklyn Bridge. Three lesson pictures were generated in Cursor. The prompt is `upload-1-code/pacman-3d/prompts/grok-lessons.md`. Gemini still writes the riddle. ElevenLabs is the only voice.
- **Photos:** 189 Wikimedia Commons photos with the author and license on every card.
- **Hosting:** a static site on Vercel at **pac-manhattan.tech**.

## Challenges we ran into

- **The map thought New York Harbor was land.** Our coastline method works for an island like Manhattan, but Brooklyn and Queens are part of Long Island. We switched those to NYC's official shoreline-clipped boundaries.
- **The bridges disappeared.** Cutting streets to land also cut every bridge deck over the river. We rebuilt each crossing from its real landing points and snapped them to the nearest street (all within about 200 m).
- **170,000 buildings in a browser tab.** We build geometry only near the camera and skip open-water ground tiles, so the five-borough map loads in a few seconds.
- **Keeping an LLM honest.** Early riddles invented dates. The number check and name-leak check fixed that.
- **Four people, four versions.** We had two 2D prototypes and two 3D versions on separate branches, and merged them into one game on the last night.
- **Free-tier rate limits** during riddle generation, fixed with backoff and saving after every riddle.

## Accomplishments that we're proud of

- All five boroughs in one playable map, including a real ferry ride.
- Every one of the 244 places on the five-borough map is reachable by street from Times Square. We checked, and Staten Island is reachable only by ferry, just like real life.
- Every building is colored from real city data.
- A title screen that shows the game instead of explaining it.

## What we learned

- Real maps are messy. Islands, bridges and shorelines each needed their own fix.
- An LLM is useful for writing when you give it a source and check its output against that source.
- Showing beats telling: a game that plays itself on the title screen explains more than any instructions.

## What's next for Pac-Manhattan

- **Walk mode:** earn real Passport stamps when your phone's GPS reaches a place.
- **The subway as fast travel,** like the ferry.
- **Whole boroughs,** not just neighborhoods, including the Rockaways and City Island.
- **Then vs. now:** archival photos (NYPL, NYC Municipal Archives) next to today's view on every landmark card.
- **A daily riddle and a shareable Passport card.**
- A global leaderboard and ghost skins unlocked with stamps.

**Built with:** three.js, javascript, html5, css3, node.js, python, shapely, pillow, openstreetmap, overpass-api, nyc-open-data, tiger-data, timescaledb, postgresql, mongodb, gemini, elevenlabs, wikipedia, vercel, tech-domains

---

## 3-minute judging script (not for Devpost)

1. **Hook (20 s):** "86% of New Yorkers who move stay in their own borough. We built a game that drags you out of your bubble." Show the live title screen.
2. **Play (70 s):** pick Manhattan, solo. Read the riddle out loud and let a judge guess. Run to a ★ landmark to show the photo card and hint, then find the target.
3. **Wow (50 s):** switch to All five boroughs. Show the ferry: "Chompers can't swim." Point out the real building colors (brownstones vs. Midtown glass).
4. **How (30 s):** OpenStreetMap + NYC aerial photos + PLUTO; Gemini riddles with a fact checker; Tiger Data for "know the block" and live riddle stats; ElevenLabs narrator.
5. **Close (10 s):** "Next: walk mode, so the stamps come from real places."
