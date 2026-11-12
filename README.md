# Lumen — offline self-growth desktop app

Book summaries, brain training, speaking coach, habits/journal and progress analytics in one Electron app. No network needed: all content is bundled and progress is saved to a local JSON file.

## Run
    npm install
    npm start

## Build installers
    npm run dist:win     # .exe (NSIS)
    npm run dist:mac     # .dmg
    npm run dist:linux   # AppImage

## Features
- **Today**: daily plan (read, train, speak, reflect), daily XP goal ring, quote, word of the day
- **Library**: key-idea summaries with progress, quiz, save-to-review
- **Review**: spaced-repetition flashcards (Leitner boxes)
- **Brain Training**: Speed Math, Pattern Memory, Color Clash, Word Recall*, Quick Reflex*
- **Speaking**: impromptu drills with mic recording + filler counter, tongue twisters, Pace coach* (WPM), vocabulary
- **Grow**: habits with streaks, mood journal and chart, growth tree
- **Progress**: XP/levels, streaks, activity heatmap, weekly chart, skills, achievements, trends & insights*
- **Premium** (*): 7-day offline trial or license key (`node tools/genkey.js 5`)

Data file: `%APPDATA%/Lumen/lumen-data.json` (Windows), `~/Library/Application Support/Lumen/` (macOS), `~/.config/Lumen/` (Linux).

Note: the license check is a simple offline checksum, and the purchase buttons are not wired to a payment provider yet.

## Web app (offline PWA)
The `src/` folder is also an installable web app. Host it on any HTTPS static host (GitHub Pages, Netlify, Vercel), open it once, then click **⬇ Install app** in the sidebar (or the browser's install icon, or "Add to Home Screen" on a phone). After the first visit it works with no internet.

Test locally:
    cd src && python3 -m http.server 8080   # open http://localhost:8080

Progress in the web version is saved in the browser (localStorage). Use Settings → Export backup to move it between devices.
When you change files, bump `CACHE` in `src/sw.js` (e.g. `lumen-v2`) so installed copies update.
