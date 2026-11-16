CHECKS PART 2  (A7, B1, B2, D1, D2, D3, wordsParser, validation)

YADDA ZA KA SAKA SU
1. Ka ajiye kwafin index.js na yanzu a wani wuri daban (server\src\rules\index.js), idan kana so.
2. Ka cire zip din (Extract All) a Desktop.
3. A cikin folder din da ka cire, za ka ga folder "server" mai "src" da "tests".
4. Ka ja "src" da "tests" ka sauke su cikin folder "server" na project dinka (IR verifier\server).
   Windows zai ce wasu fayiloli sun yi karo. Ka zabi "Replace" kawai ga index.js.
   Sauran fayiloli sababbi ne, ba za su taba naka ba.
5. Ka bude terminal a cikin IR verifier\server (layin ya kare da \server>) ka rubuta: npm test
6. Ya kamata ka ga: tests 50, pass 50, fail 0
   (gwaje-gwajenka 18 + sababbi 32)

SABBIN FAYILOLI
server\src\rules\
  a7-used-below-accredited.js   A7 (info): used ballots kasa da accredited
  b1-figures-vs-words.js        B1: lamba ba ta yi daidai da kalmominta ba
  b2-words-missing.js           B2 (info): kalmomi sun bace ko ba a gane su ba
  d1-unreadable-fields.js       D1: fili da ba a karanta ba ko mai wuyar karantawa
  d2-poor-image.js              D2: hoto mara kyau
  d3-blank-sheet.js             D3: fom babu komai
  sheetState.js                 kananan kayan aiki da D1 da D3 da B1 da B2 ke amfani da su
  index.js                      MAYE GURBIN naka: yanzu yana da dukkan ka'idoji 12
server\src\services\
  wordsParser.js                yana juya "two hundred and twenty five" zuwa 225
  validation.js                 yana gudanar da ka'idoji, ya yanke hukunci: clean ko needs_review
server\tests\
  wordsParser.test.js, rules2.test.js, validation.test.js

A6 da helpers.js da rules.test.js na ka ba a taba su ba.
