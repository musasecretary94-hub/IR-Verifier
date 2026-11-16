// The six demo photos in /demo-sheets must behave exactly as described in their README.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const sub = require('../src/services/submissions');
const results = require('../src/services/results');
const { makeCtx, addAgent, adminUser } = require('./helpers/setup');

const dir = path.join(__dirname, '..', 'demo-sheets');
const truthFile = path.join(dir, 'truth.json');
const have = fs.existsSync(truthFile);
const truth = have ? JSON.parse(fs.readFileSync(truthFile, 'utf8')) : [];

function valuesFrom(t) {
  return {
    header: { puCode: t.polling_unit, serialNo: t.serial_no },
    counts: { ...t.counts },
    parties: t.parties.map((p) => ({ party: p.party, figures: p.figures, words: p.words })),
    totalValidRow: t.total_valid_row,
    totalValidRowWords: t.total_valid_row_words,
  };
}
const dataUrl = (t) => 'data:image/png;base64,' + fs.readFileSync(path.join(dir, t.file)).toString('base64');

test('there are six demo sheets with their answers', { skip: !have && 'demo-sheets not found' }, () => {
  assert.strictEqual(truth.length, 6);
  truth.forEach((t) => assert.ok(fs.existsSync(path.join(dir, t.file)), t.file));
});

test('the demo sheets match the registry and behave as planned', { skip: !have && 'demo-sheets not found' }, () => {
  const ctx = makeCtx();
  const admin = adminUser(ctx);
  const seen = {};
  truth.forEach((t) => {
    const agent = addAgent(ctx, t.polling_unit); // the polling unit must exist in the demo registry
    assert.strictEqual(t.counts.registered, agent.pu.registered, t.file + ': registered voters match the registry');
    const check = sub.checkForAgent(ctx, agent, valuesFrom(t));
    const codes = check.findings.map((f) => f.code);
    seen[t.plan] = (seen[t.plan] || 0) + 1;

    if (t.plan === 'clean' || t.plan === 'blurry') {
      assert.strictEqual(check.canSubmit, true, t.file);
      assert.strictEqual(check.needsNote, false, t.file);
      const r = sub.createSubmission(ctx, agent, { values: valuesFrom(t), image: dataUrl(t), attested: true, ip: 'x' });
      sub.approve(ctx, admin, r.id, 'x');
      assert.strictEqual(results.getUnit(ctx.db, t.polling_unit).approved, true);
    } else if (t.plan === 'words_mismatch') {
      assert.strictEqual(check.canSubmit, true, 'a warning does not block');
      assert.strictEqual(check.needsNote, true);
      assert.ok(codes.includes('B1'));
      assert.throws(() => sub.createSubmission(ctx, agent, { values: valuesFrom(t), image: dataUrl(t), attested: true }), (e) => e.code === 'note_required');
      const r = sub.createSubmission(ctx, agent, { values: valuesFrom(t), image: dataUrl(t), note: 'The words on this sheet are written differently.', attested: true });
      assert.strictEqual(r.status, 'pending');
    } else if (t.plan === 'total_mismatch') {
      assert.strictEqual(check.canSubmit, false, 'a wrong total blocks the submission');
      assert.ok(codes.includes('A2'));
      assert.throws(() => sub.createSubmission(ctx, agent, { values: valuesFrom(t), image: dataUrl(t), attested: true }), (e) => e.code === 'checks_failed');
    }
  });
  assert.deepStrictEqual(seen, { clean: 3, words_mismatch: 1, total_mismatch: 1, blurry: 1 });
  assert.strictEqual(results.getArea(ctx.db, {}).coverage.approvedUnits, 4);
});

test('the demo photos are all different (no duplicate evidence)', { skip: !have && 'demo-sheets not found' }, () => {
  const crypto = require('node:crypto');
  const hashes = new Set(truth.map((t) => crypto.createHash('sha256').update(fs.readFileSync(path.join(dir, t.file))).digest('hex')));
  assert.strictEqual(hashes.size, 6);
});
