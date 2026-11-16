# IR Verifier: PROJECT.md (read this first, every session)

Last updated: 7 Nov 2026. **Update the Status section at the end of every work session.**

## 1. What this project is

Independent Result Verifier, built by Musa (solo) for the #AI4Elections Hackathon (Rise Networks), Track 2: Electoral Data Analysis, Operational Insights and Decision Support.

A web system with three parts, all DEMO with SYNTHETIC data:
1. Agent screen: photo of the polling unit result sheet (EC8A), agent types or corrects the numbers (AI reading is optional), the server runs strict checks, the agent sends it only when no "must fix" is left.
2. Admin screen: reviews photo + numbers + findings. Can only approve or reject (with a reason). Cannot edit numbers.
3. Public page: approved results only, for every polling unit, then ward, LGA, state and country, with coverage shown.

It never accuses anyone. Every page shows: "Unofficial independent analysis, not official results."

## 2. Hard rules (hackathon)

- Synthetic, public or expressly authorised data only. Never touch or test live electoral systems. Not for real elections.
- Nonpartisan: every party is shown and treated the same way (the demo parties are fictional).
- AI output is never presented as official results. A human decides on every flag.
- Be honest about accuracy and limits (testing evidence is part of the submission). Disclose that AI helped write the code, and check the competition rules about it.
- Dates: shortlisting news 13-16 Nov; onboarding 18-19 Nov; bootcamp 23-27 Nov; build sprint 28 Nov-13 Dec; SUBMIT 13 Dec (aim for 12 Dec); Demo Day 15-16 Dec.
- Submission needs: problem statement, working prototype, technical documentation and method, testing evidence and limitations, responsible AI/privacy/security notes, presentation, 2-minute video.

## 3. Rules for any AI assistant working on this project

1. Read this file first. If something here conflicts with your memory, this file wins.
2. Do NOT rename, move or restructure files and folders without asking Musa first.
3. Before writing code, say in plain words what you will change and which files are touched.
4. Server code is CommonJS (`require`, `module.exports`). The React client is ES modules. Never mix them in one file.
5. Every new feature gets tests. `npm test` in `server` must stay green.
6. Explain in clear, colloquial Hausa (technical terms in English). One step at a time, then wait for Musa to confirm.
7. Musa is a beginner with Node.js and databases and wants to UNDERSTAND the code. Explain first, keep steps small.
8. Do not add features that are not in this plan. Ask first.
9. Say clearly what was tested and what was NOT tested.
10. At the end of the session, give Musa updated text for the Status section below.

## 4. Workflow and status

Agent: photo -> (optional AI reads it) -> agent types/corrects -> server checks -> send.
Admin: approve or reject (reason needed). Approve re-checks the numbers. Final decisions cannot change.
Public: approved only; totals summed polling unit -> ward -> LGA -> state -> country.

The old 9-step algorithm now maps to code: 1 Extract = `ai/anthropic.js` + `services/extraction.js` (optional, NOT tested with the real AI service). 2 Normalize = `services/normalize.js`. 3 Check = `rules/*` + `services/serverChecks.js`. 4 Route = `services/validation.js`. 5 Review = admin screen + `services/submissions.js`. 6 Re-check = on submit and on approve. 7 Aggregate = `services/results.js`. 8 Compare with announced totals = NOT built (not requested). 9 Explain = `services/explain.js` (English + Hausa).

## 5. Folder structure

```
IR verifier/
  client/src/      React + Vite: App.jsx, main.jsx, api.js, i18n.js, components/ (Login, AgentDashboard, AdminDashboard, PublicPage, ...)
  server/
    package.json   .env (from .env.example)   demo-sheets/ (6 synthetic photos + truth.json)
    scripts/       seed.js, seed-demo.js, create-user.js
    src/
      index.js, app.js
      config/      env.js, elections.js (party list = a setting)
      db/          schema-app.sql, connection.js, demoData.js, png.js
      security/    passwords.js, tokens.js, rateLimit.js, images.js
      middleware/  auth.js, errors.js, security.js
      routes/      auth.js, agent.js, admin.js, public.js
      rules/       a1..a7, b1, b2, d1, d2, d3 (+ helpers, sheetState, index)
      services/    wordsParser, normalize, validation, pipeline, audit, explain, values, serverChecks, users, submissions, results, extraction
      ai/          anthropic.js
    tests/         helpers/ + rules, rules2, validation, wordsParser, normalize, pipeline, security, explain, extraction, flow, api, demo-sheets
```

## 6. API (all JSON)

Public: GET /api/public/config, /results?state=&lga=&ward=, /units/:code, /units/:code/image. POST /api/auth/login, GET /api/auth/me.
Agent (login): GET /api/agent/unit; POST /api/agent/check, /extract, /submissions; GET /api/agent/submissions/:id and /:id/image.
Admin (login): GET /api/admin/stats, /submissions?status=, /submissions/:id, /:id/image, /audit; POST /api/admin/submissions/:id/approve and /reject. There is NO edit route.

## 7. How to run and test

```
cd server  ->  npm install  ->  copy .env.example .env (set TOKEN_SECRET)  ->  npm test  ->  npm run seed  ->  npm run seed:demo  ->  npm start
cd client  ->  npm run dev   (open http://localhost:5173)
```
Always check the folder shown before the `>` in the terminal.

## 8. Decisions log

- Track 2 chosen. Solo. Synthetic data only. Demo parties are fictional.
- Checks are plain code, not AI (traceable, testable). AI is only for reading the photo, optional, and always confirmed by the agent.
- null means "could not read": checks skip it, D1/F1 report it, so an unreadable sheet never looks clean.
- Database protects itself (triggers): numbers never change, decisions are final, one approved result per polling unit, audit log is append-only.
- Admin cannot edit: no route, no service function, database refuses.
- One agent per polling unit in this prototype (limit: real use needs several independent observers).

## 9. Status and next steps (UPDATE EVERY SESSION)

- Built: server (auth, workflow, checks, aggregation, AI reading module, security), SQLite database, React screens, 6 demo sheets, ~140 tests.
- Tested: server logic, database rules and API with a stand-in for Express (all pass). NOT tested: real Express run, React screens in a browser, the real AI service.
- Next: (1) run it on Musa's machine and fix what fails (2) try the AI reading on the demo sheets, record accuracy (3) write the documentation in Musa's own words (4) presentation and 2-minute video (5) optional: compare with announced totals, several observers per unit.

## 10. Open items

- Email to comms@risenetworks.org (sent earlier, no reply yet): may work start before 28 Nov, are AI coding assistants allowed or must their use be disclosed, may public IReV images be used for testing.
- Small cleanup: in A6 rename `expectedIsssued` to `expectedIssued` (also in its test); remove `console.log` from the A6 test.
