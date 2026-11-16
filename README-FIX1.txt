FIX 1: CLEAN START (share duk sakamakon kirkira, sannan ka yi uploading na kanka)

Abin da wannan ke yi
- reset-results : yana share DUK sakamakon da aka aika (har da na "seed:demo") da hotunansu. Yana barin rumfuna 72, admin da wakilai.
- create-agents : yana ba kowace rumfa wakili (rumfuna 72), yana adana jerin a agents.local.csv (a bude shi a Excel).

Matakai (a cikin folder "server", layin terminal ya kare da \server>)
1. Ka tsayar da sabar (Ctrl+C a terminal ta sabar).
2. Ka cire zip din cikin folder din waje "IR verifier" (Extract All). Windows zai tambaya game da package.json da .gitignore: ka zabi Replace.
3. npm test                      (ya kamata duka su wuce, kusan 149)
4. npm run reset-results         (yana nuna abin da zai share, bai share komai ba)
   npm run reset-results -- --yes (yana share da gaske)
5. npm run create-agents -- --all --password KalmarGwaji2026
   (kalmar sirri daya ga duka wakilai, na gwaji ne kawai, aƙalla haruffa 10, yana aiki ne idan DEMO_MODE=true)
   Ko ka bar "--password ..." ka bar kowane wakili ya samu kalmar sirri ta bazuwar (za ka same su a agents.local.csv).
6. Ka bude agents.local.csv a Excel: yana da rumfuna 1 zuwa 72 bisa tsari, sunan wakili, kalmar sirri, da ginshiki "done" don bin diddigi.
7. npm start, sannan a client: npm run dev. Shafin jama'a ya kamata ya nuna 0 / 72.

Abubuwa da za ka kula da su
- Kowace rumfa tana bukatar HOTO DABAN da lamba S/N DABAN (tsarin yana ki idan an yi amfani da hoto ko S/N iri daya ga wata rumfa).
- "Masu rajista" (#1) dole ya yi daidai da na rajista (ana nuna shi a shafin wakili); in ba haka ba za a samu gargadi C4.
- Lambobinka dole su wuce binciken (jimillar jam'iyyu = valid votes da sauransu).
- Kowane sakamako yana bukatar admin ya amince kafin ya bayyana ga jama'a.
- Hotunan "demo-sheets" guda shida na rumfuna shida ne kawai (KN-01-01-001, KN-02-01-001, LA-01-01-001, LA-02-01-001, OY-01-01-001, OY-02-01-001).
- agents.local.csv ba a sake rubuta shi idan ba a kirkiri sabon wakili ba; idan an kirkira, ana ajiye tsohon a matsayin agents.local.csv.bak-... Kada ka share shi, domin kalmomin sirri ba a iya karanta su a database.
- Tarihin ayyuka (audit log) ba a share shi (an tsara haka da gangan); za a ga "results.cleared".
