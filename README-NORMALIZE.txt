STEP 2: NORMALIZE  (+ pipeline: normalize -> check -> route)

YADDA ZA KA SAKA (dukkan fayilolin sababbi ne, babu wanda zai yi karo da naka)
1. Ka danna dama a kan zip, ka zabi Extract All.
2. A wurin da yake tambaya, ka zabi folder din waje: ...\Desktop\IR verifier  (ba "server" ba), sai Extract.
   Za a hada "server" din zip da naka. Idan Windows ya tambaya ko a maye gurbin wani fayil, ka danna Cancel ka gaya mani.
3. Ka duba:
     dir /b src\services     -> normalize.js, pipeline.js, validation.js, wordsParser.js
     dir /b data             -> sample-extraction.json
     dir /b tests            -> rules.test.js, rules2.test.js, validation.test.js, wordsParser.test.js, normalize.test.js, pipeline.test.js
4. npm test   (a terminal da ya kare da \server>)
   Ya kamata ka ga: tests 74, pass 74, fail 0   (naka 50 + sababbi 24)

SABBIN FAYILOLI
server\src\services\normalize.js       yana juya abin da AI ya karanta zuwa siffar da ka'idoji ke fahimta
server\src\services\pipeline.js        analyzeExtraction(): normalize -> check -> route a kira daya
server\data\sample-extraction.json     MISALIN abin da AI zai dawo da shi. Ka bude ka karanta shi.
server\tests\normalize.test.js, pipeline.test.js
