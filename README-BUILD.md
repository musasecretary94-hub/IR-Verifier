# IR Verifier: complete prototype (agent, admin, public page)

**DEMO ONLY. Synthetic data.** Built for the #AI4Elections Hackathon (Track 2). Nothing here is, or may be presented as, an official result. Every page shows an UNOFFICIAL banner. Do not use it for a real election: the hackathon rules allow only synthetic, public or expressly authorised data, and a real use would need written authorisation.

## What it does

```
AGENT (at the polling unit)          ADMIN (reviewer)                 PUBLIC (everyone)
1. photo of the EC8A sheet           5. sees photo + numbers          8. results of every polling
2. (optional) AI reads the photo        + findings + agent's note        unit, then ward, LGA,
3. agent types / corrects numbers    6. can ONLY approve or reject       state, and the country
4. server checks (strict) -> send    7. reject needs a reason          (only APPROVED results,
   only if no "must fix" left           approve -> goes public           with coverage shown)
```

- **Agent**: one agent per polling unit. The server (not the browser) runs all the checks again. A "must fix" finding blocks sending. A "check" (warning) needs a short note. The agent must tick "I compared every number with the photo".
- **Admin**: sees everything but there is **no way to edit numbers** (no such route, and the database refuses it too). Approve or reject (with a reason). A rejected agent can send again (version 2).
- **Public**: only approved results are counted. Totals for ward, LGA, state and country are summed from the polling units, and the page says how many polling units are counted ("partial totals" warning).

## Checks (all explained in English and Hausa, never accusing)

A1-A7 arithmetic, B1-B2 figures vs words, D2-D3 photo quality, plus the server checks:
C1 (sheet code is not your polling unit), C2 (earlier attempt exists), C3 (same photo or serial number used for another polling unit), C4 (registered voters differ from the registry), F1 (form incomplete).

## Run it (Windows, Node 22)

Terminal 1 (server):
```
cd "IR verifier\server"
npm install
copy .env.example .env
npm test
npm run seed
npm run seed:demo
npm start
```
- Open `.env` and set `TOKEN_SECRET` (make one with `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`).
- `npm run seed` creates 72 synthetic polling units, 1 admin and 6 demo agents. The passwords are printed once and saved in `credentials.local.txt` (private, never commit it).
- `npm run seed:demo` (optional) fills the public page with synthetic approved results. The 6 agent polling units stay free for you to try.

Terminal 2 (web app):
```
cd "IR verifier\client"
npm run dev
```
Open http://localhost:5173 . If Vite uses another port, add it to `CORS_ORIGINS` in `.env` and restart the server.

## Try it in 5 minutes

1. Open the public page: it shows the demo totals and drill-down (country > state > LGA > ward > polling unit).
2. Log in as `agent-kn-01-01-001`. Choose `demo-sheets/sheet-KN-01-01-001.png`, type the numbers you see (they are also in `demo-sheets/truth.json`), tick the box, send.
3. Log in as `admin`. Open the waiting result, compare the photo with the numbers, approve.
4. Back on the public page: that polling unit is now counted.
5. Try the other demo sheets: one has a words mismatch (warning, needs a note), one has a wrong total (cannot be sent), one is blurry. See `demo-sheets/README.txt`.

## AI reading (optional)

Without settings, agents type the numbers. To let AI pre-fill the form, put `AI_PROVIDER=anthropic` and `AI_API_KEY=...` in `.env` (and optionally `AI_MODEL`). The AI only **copies** what is on the sheet; it never adds up or corrects. The agent must still confirm every number. **This part was not tested against the real AI service** (only with a stand-in), so test it with the blurry demo sheet and write down the results.

## Protections built in

Passwords (scrypt, salted), signed login tokens with expiry, the user is checked in the database on every request (a switched-off account stops at once), roles checked on every route, login limit (8 tries / 15 min), general limit (600 requests / min), AI limit (20 / hour), body size limits, photos checked by their first bytes (JPEG/PNG/WebP only, no SVG), size limit, photos stored under random names, SQL always with parameters, security headers, CORS allow-list, no stack traces shown to users, an agent can only see their own polling unit, the public sees only approved results.
In the database itself: submitted numbers and photos can never change, a decision (approved/rejected) is final, only one approved result per polling unit, the audit log cannot be edited or deleted. On approval the numbers are checked again and duplicate evidence is refused.

## Tests

`npm test` in `server`: about 140 tests (old 74 + 67 new). The web-server tests (`api.test.js`) need `npm install` (Express) and are skipped without it.
Important: the author could not install Express or run React in the build environment. The server logic, database and API were tested with a small stand-in for Express; the real Express run on your machine is the final check. The React screens were checked for syntax and for undefined names, but **not rendered**. If something fails on your machine, send the full error.

## Honest limits

- One agent per polling unit: a dishonest agent could type false numbers that match a false photo. The admin comparing photo and numbers is the control. Real use would need several independent observers per polling unit and conflict handling.
- SQLite is fine for a demo. A real national system (about 176,000 polling units, many users at once) would need PostgreSQL, queues, backups and monitoring.
- No HTTPS here (put it behind HTTPS when deployed), no password reset, no two-factor login, no formal security audit.
- Agents resize photos in the browser before sending (max 1800 px), so the stored photo is the resized one.
- The party list and place names are demo settings (`src/config/elections.js`, `src/db/demoData.js`). The demo parties are fictional on purpose.
- AI assistance: this code was written with AI assistance. Disclose this honestly in the hackathon documentation, and check the competition rules on it.

## Folder map (new or changed)

```
server/
  package.json  .env.example  .gitignore  demo-sheets/  scripts/
  src/ app.js  index.js  config/  db/  security/  middleware/  routes/  ai/
       services/ (audit, explain, values, serverChecks, users, submissions, results, extraction)
  tests/ (helpers/, security, explain, extraction, flow, api, demo-sheets)
client/src/ App.jsx  main.jsx  App.css  index.css  api.js  i18n.js  components/  utils/
```
The old `server/src/db/schema.sql` is replaced by `src/db/schema-app.sql` and can be deleted.

---

## Gajeren bayani (Hausa)

Wannan cikakken samfurin gwaji ne: wakili yana ɗaukar hoton EC8A, ya rubuta lambobi, uwar garke tana bincike mai tsauri; admin yana dubawa (ba zai iya canza lamba ba, amincewa ko ƙi kawai); sakamakon da aka amince kawai yake bayyana ga jama'a (rumfa, mazaɓa, ƙaramar hukuma, jiha, ƙasa). Bayanan kirkira ne kawai, kuma kowane shafi yana nuna "BA NA HUKUMA BA". Kada a yi amfani da shi a zaɓe na gaske.
