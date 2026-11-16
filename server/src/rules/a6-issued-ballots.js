// Box #3 (issued ballots papers to the pollen unit) must be equal
// to unused ballots paper ( box #4) and the total used ballots
//box #8 (box #5+#6+#7)

    const { allNumbers } = require('./helpers');
module.exports = function a6(sheet){

    const { issued, unused, usedTotal} = sheet.counts;
    if(!allNumbers([ issued, unused, usedTotal])) return null;

    const expectedIsssued = unused + usedTotal;

    if(issued === expectedIsssued) return null;

    return{
        code: 'A6',
        severity: 'warning',
        details: { usedTotal, issued, unused, expectedIsssued, difference: issued - expectedIsssued},
    };
};