FIX 2: CANZA "REGISTERED VOTERS" DA KANKA (export zuwa Excel, import zuwa database)

Abin da wannan ke yi
- export-registry : yana rubuta duk rumfuna 72 zuwa fayil din CSV (units-registered.csv) da za ka bude a Excel.
- import-registry : yana karanta CSV din ya sabunta database. A farko yana NUNA abin da zai canza ne kawai; sai ka kara "--yes" ya canza da gaske.
  Idan fayil din yana da kuskure KO DAYA, babu abin da zai canza. Ba a taba share rumfa.

Matakai (a cikin folder "server", layin terminal ya kare da \server>)
1. Ka tsayar da sabar (Ctrl+C). Ka kwafi server\data\verifier.db zuwa wani wuri (ajiya).
2. Ka cire zip din cikin folder din waje "IR verifier" (Extract All). Windows zai tambaya game da package.json: ka zabi Replace.
3. npm test                  (ya kamata duka su wuce, kusan 162)
4. npm run export-registry   (yana kirkirar units-registered.csv a cikin "server")
5. Ka bude units-registered.csv a Excel. Ka canza GINSHIKIN "registered" kawai (ko ka kara sabbin layuka). Ka ajiye a matsayin "CSV (Comma delimited)" ko "CSV UTF-8".
6. npm run import-registry -- units-registered.csv
   (yana nuna: nawa ne sababbi, nawa ne za su canza, nawa ba su canza ba. Bai canza komai ba tukuna.)
7. Idan abin da ya nuna daidai ne:
   npm run import-registry -- units-registered.csv --yes
8. Ka sake kunna sabar. Shafin wakili yanzu zai nuna sabuwar lamba.

Fayil din na iya samun ginshiki biyu kawai ("code" da "registered") don canza masu rajista. Sauran ginshiki ("name", "ward", "lga", "state") ana bukatarsu ne kawai ga SABBIN rumfuna. Ginshiki na karin (kamar "done") ana yin watsi da su.

Dokoki
- KADA ka canza ginshikin "code": lambar da ba ta wanzu za a dauke ta a matsayin SABUWAR rumfa (kuma za ta bukaci name, ward, lga, state).
- Share layi a Excel BA ya share rumfa. Ana barin rumfar da ba ta cikin fayil yadda take.
- Canza masu rajista KAFIN ka fara uploading. Sakamakon da aka riga aka aika yana rike da lambar da aka aika (ba ya canzawa). Idan kana son su canza, ka yi reset-results ka sake aikawa.
- Rumfa da ta riga ta da sakamako: ba za a iya canza wurinta (name/ward/lga/state) ba, domin zai motsa kuri'unta; masu rajista kuwa ana iya canzawa (za a ga gargadi).
- Sabuwar rumfa tana bukatar wakili: npm run create-agents -- --all (yana ba kowace rumfa da ba ta da wakili).
- Lambobin hoton dole su yi daidai da na rajista (#1), in ba haka ba gargadi C4. Kuma masu rajista dole ba su gaza wadanda aka tantance ba (A5).
- Kuskure da aka fi samu: lamba mai tsaka-tsaki ("12.5"), mara kyau ("abc", "-5"), layi guda biyu masu lamba daya, ko code mara kyau. Mai shigar da fayil yana fada maka layin da kuskuren yake.
