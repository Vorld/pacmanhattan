<p align="center">
  <img src="docs/media/pacmanhattan-banner-3x1.jpg" alt="Pac-Manhattan: a ghost running through a 3D Manhattan with two chompers on its tail" width="100%">
</p>

<h1 align="center">Pac-Manhattan</h1>

<p align="center"><b>You're the ghost. New York is the maze.</b><br>
A 3D arcade chase through real NYC streets that teaches you the city one riddle at a time.</p>

<p align="center">
  <a href="https://pac-manhattan.tech"><b>▶ Play it at pac-manhattan.tech</b></a>
  &nbsp;·&nbsp; Built at <b>DivHacks 2026</b> (Columbia University) &nbsp;·&nbsp; Track: <b>Know Your City</b>
</p>

---

## The problem

**New Yorkers live in borough bubbles.**

- **86%** of New Yorkers who moved stayed in the same borough ([StreetEasy, via amNY](https://www.amny.com/news/most-new-yorkers-who-move-stay-in-their-boroughs-report-finds-1.12449875/)).
- **1 in 4** Americans have never been to the biggest attraction in their own city, and **55%** want to visit a local landmark but haven't ([OnePoll for Zipcar, 2,000 adults](https://www.foxnews.com/travel/25-percent-of-americans-havent-visited-iconic-landmarks-in-their-own-cities-study-finds)).
- We've handed our sense of direction to our phones: more lifetime GPS use goes with worse spatial memory when you navigate on your own ([Dahmani & Bohbot, *Scientific Reports*, 2020](https://www.nature.com/articles/s41598-020-62877-0)), and people navigate best in street layouts like the ones they actually grew up in ([Coutrot et al., *Nature*, 2022](https://www.nature.com/articles/s41586-022-04486-7)).

Meanwhile New York drew **65 million visitors in 2025** ([NYC Tourism + Conventions](https://www.business.nyctourism.com/press-media/press-releases/NYC-Tourism-Annual-Report-March-2026)), and most of them, like most of us, see the same few blocks.

**Games can move people.** Pokémon Go's most engaged players walked 1,473 more steps a day, a jump of over 25% ([Althoff et al., *JMIR*, 2016](https://www.jmir.org/2016/12/e315/)). So we made the game board the real map of New York.

## What it is

Pac-Manhattan flips Pac-Man. **You're the ghost**, and hungry chompers hunt you through real New York streets.

**Solve a riddle → find the place → visit ★ landmarks for hints → don't get chomped**

- 🧩 **Riddles about real places.** "Visit the former factory where the famous dark sandwich cookie was invented." Find it before the name is revealed for a 50% bonus.
- ★ **Landmarks** give you a photo, a fun fact, a Wikipedia summary, and a hint with the target's walking distance and direction. Every place you reach is stamped in your **Passport**.
- 🏙 **Know the block.** Every place card shows the streets around it, live from a 767,563-building NYC database: "151 buildings within a block or two, typically built around 1879; the oldest dates to 1819."
- 📊 **Riddle stats.** After you solve one, see how everyone else did: "12 of 17 finds solved this riddle before the name appeared, in 41 s on average."
- 👾 **Three chompers with personalities.** Chomps chases you, Sneaky cuts you off, Snooze pounces when you get close. A new one joins after every task.
- 🗽 **Seven maps.** All of Manhattan; Brooklyn, Queens, the Bronx and Staten Island; Manhattan + Brooklyn; and **all five boroughs on one map**, joined by the Brooklyn, Manhattan, Williamsburg, Queensboro, Macombs Dam and Third Avenue Bridges and the **Staten Island Ferry**. Chompers can't swim, so they wait at the terminal.
- 🎨 **A real city in real colors.** 171,710 buildings at their real heights. Roofs are colored from NYC's 2018 aerial photos and walls from each lot's year built and building class, so Brooklyn is brownstone and brick and Midtown is glass and limestone.
- 🎙 **A narrator** who warns you when a chomper is behind you and calls out every bridge you cross.
- 👥 **2-player split screen**, racing to the same places on one keyboard.

<p align="center">
  <img src="docs/media/pacmanhattan-cover-3x2.jpg" alt="The Pac-Manhattan title screen: the scared ghost in Midtown with a chomper coming around the corner" width="80%">
</p>

## How it works

| Piece | What we used it for |
|---|---|
| **Three.js** | The 3D city, characters and camera. Plain HTML and JavaScript, no build step. Buildings are built in chunks near the camera, and a see-through shader keeps the ghost visible behind skyscrapers. |
| **OpenStreetMap** | Streets, parks, water, buildings and shorelines for every borough, turned into a routable street graph (chompers use A* pathfinding). |
| **NYC Open Data** | 2018 aerial photos for roof colors, PLUTO lot data for wall materials, and 2020 neighborhood boundaries for Brooklyn and Queens (which sit on Long Island). |
| **Tiger Data** (TimescaleDB) | "Know the block" queries a 767,563-building table by location. Every riddle outcome goes into a **hypertable**, and a **real-time continuous aggregate** turns it into each place's solve rate and average time. |
| **MongoDB Atlas** | Global high scores, Passport stamps and finished runs, with a browser fallback when the database can't be reached. |
| **Gemini API** | Writes a riddle for every place from that place's own Wikipedia summary. A checker rejects any riddle that uses a word of the name or a number that isn't in the source. |
| **ElevenLabs** | The narrator, recorded once at build time, so no API key ever reaches the browser. |
| **Vercel + .tech** | Static hosting plus serverless functions, at [pac-manhattan.tech](https://pac-manhattan.tech). |

## Run it locally

```sh
cd upload-1-code/pacman-3d
python3 -m http.server 8765
# open http://localhost:8765
```

That's the whole game. The live panels (Tiger Data) and global scores (MongoDB) need the serverless functions in `api/` and their database connection strings: run `npm install` and `npm run dev` with `TIGER_DATABASE_URL` and `MONGODB_URI` in `upload-1-code/pacman-3d/.env.local`. Without them the game plays the same and simply skips those parts.

The game's own [README](upload-1-code/pacman-3d/README.md) covers the controls, the code layout, tuning, and how to rebuild the map data, riddles and narrator.

## Repository

```
upload-1-code/pacman-3d/   the game (index.html, src/, data/, api/, tools/, sql/)
docs/devpost.md            our Devpost write-up
docs/media/                cover and banner images
```

## Team

Built in 24 hours at DivHacks 2026 by Candy Xie, Tyler Sheng Kok, Alina Du, Venugopal Kulkarni and [@Vorld](https://github.com/Vorld).

## Credits

Map data © [OpenStreetMap](https://www.openstreetmap.org/copyright) contributors (ODbL). Aerial imagery © NYC DoITT. Building and lot data: NYC PLUTO and HPD. Neighborhood boundaries: NYC Department of City Planning. Place photos from Wikimedia Commons (author and license on every card) and summaries from Wikipedia (CC BY-SA). The chomper is an original character and is not affiliated with Pac-Man or Bandai Namco.
