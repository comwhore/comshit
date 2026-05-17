# comshit/scripts

Browser **userscripts** (Tampermonkey, Violentmonkey, etc.) that add a dump button on social sites and export followers, following, friends, or overlap lists to **CSV**. You can later import them in Obsidian using the [@obsidian-comshit](https://github.com/comwhore/obsidian-comshit) plugin if you want.

## Install

1. Install a userscript manager ([Tampermonkey](https://www.tampermonkey.net/) or similar).
2. Create a new script and paste the contents of the `.js` file you need (or point the manager at the file if it supports local scripts).
3. Open the matching site, go to the profile / friends / follows page, and use the floating **Dump** button.

## Scripts

| File | Site | What it dumps |
|------|------|----------------|
| `instagram-follow-dump-user.js` | Instagram | Following, followers, common users |
| `tiktok-follow-dump-user.js` | TikTok | Following, followers, common users |
| `bluesky-follow-dump-user.js` | Bluesky (`bsky.app`) | Follows, followers, common users |
| `spotify-follow-dump-user.js` | Spotify (`open.spotify.com/user/...`) | Followers, following, common users |
| `soundcloud-follow-dump.js` | SoundCloud | Followers, following, common users |
| `steam-friends-dump-user.js` | Steam Community | Friends list |
| `roblox-friends-dump-user.js` | Roblox | Friends list |

## Usage notes

- Stay on the correct page (e.g. `/followers`, `/following`, or friends tab) before starting a dump, I also don't recommend doing anything with the website while it's running.
- Most scripts support **Stop** mid-run and may resume state in `sessionStorage` until you close the tab.
- Sites change their DOM often; if a button never appears or the CSV is empty, the selectors in that script may need updating, so make an issue about it.
- Use responsibly and follow each platform’s terms of service.

# PRs appreciated when something breaks

# If you want a service to be added, make an issue, and I'll think about it. Maybe.
