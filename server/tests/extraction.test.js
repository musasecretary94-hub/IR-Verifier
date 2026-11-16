const test = require('node:test');
const assert = require('node:assert');
const { pickJson, readSheet } = require('../src/ai/anthropic');
const { extractForForm, aiAvailable } = require('../src/services/extraction');
const { makeCtx, pngDataUrl } = require('./helpers/setup');
const sample = require('../data/sample-extraction.json');

const okFetch = (text, status = 200) => async () => ({ ok: status === 200, status, json: async () => ({ content: [{ type: 'text', text }] }) });

test('pickJson reads JSON even inside code fences and extra words', () => {
  assert.deepStrictEqual(pickJson('```json\n{"a":1}\n```'), { a: 1 });
  assert.deepStrictEqual(pickJson('Here you go: {"a":{"b":2}} thanks'), { a: { b: 2 } });
  assert.throws(() => pickJson('no json here'));
});

test('readSheet sends the photo and the key, and returns what the AI wrote', async () => {
  let seen;
  const fetchImpl = async (url, init) => { seen = { url, init }; return okFetch('```json\n' + JSON.stringify(sample) + '\n```')(); };
  const config = { ai: { apiKey: 'sk-test', model: 'm1' } };
  const out = await readSheet({ config, buffer: Buffer.from('abc'), mime: 'image/png', fetchImpl });
  assert.strictEqual(out.header.pu_code, '003');
  assert.strictEqual(seen.url, 'https://api.anthropic.com/v1/messages');
  assert.strictEqual(seen.init.headers['x-api-key'], 'sk-test');
  const body = JSON.parse(seen.init.body);
  assert.strictEqual(body.model, 'm1');
  assert.strictEqual(body.messages[0].content[0].type, 'image');
  assert.strictEqual(body.messages[0].content[0].source.media_type, 'image/png');
  assert.ok(body.messages[0].content[1].text.includes('PA'));
});

test('readSheet turns every failure into a friendly error', async () => {
  const config = { ai: { apiKey: 'k', model: 'm' } };
  const args = { config, buffer: Buffer.from('x'), mime: 'image/png' };
  await assert.rejects(readSheet({ ...args, fetchImpl: okFetch('', 500) }), (e) => e.code === 'ai_failed' && e.status === 502);
  await assert.rejects(readSheet({ ...args, fetchImpl: async () => { throw new Error('network down'); } }), (e) => e.code === 'ai_failed');
  await assert.rejects(readSheet({ ...args, fetchImpl: okFetch('sorry, I cannot read it') }), (e) => e.code === 'ai_bad_answer');
});

test('the AI key never appears in an error message', async () => {
  const config = { ai: { apiKey: 'sk-secret-123', model: 'm' } };
  await assert.rejects(
    readSheet({ config, buffer: Buffer.from('x'), mime: 'image/png', fetchImpl: okFetch('', 401) }),
    (e) => !String(e.message).includes('sk-secret-123'),
  );
});

test('without AI settings the extract service says so', async () => {
  const ctx = makeCtx();
  assert.strictEqual(aiAvailable(ctx.config), false);
  await assert.rejects(extractForForm(ctx, pngDataUrl('x')), (e) => e.code === 'ai_not_configured' && e.status === 503);
});

test('with AI settings the answer becomes form values (dashes cleaned, nothing guessed)', async () => {
  const ctx = makeCtx({}, { ai: { provider: 'anthropic', apiKey: 'k', model: 'm' } });
  assert.strictEqual(aiAvailable(ctx.config), true);
  const raw = JSON.parse(JSON.stringify(sample));
  raw.counts.accredited = { v: null, l: 'illegible' };
  const out = await extractForForm(ctx, pngDataUrl('x'), { fetchImpl: okFetch(JSON.stringify(raw)) });
  assert.strictEqual(out.values.counts.spoiled, 2);          // "-02-" cleaned
  assert.strictEqual(out.values.parties[0].figures, 200);    // "-200-" cleaned
  assert.strictEqual(out.values.counts.accredited, null);    // not guessed
  assert.strictEqual(out.readability.accredited, 'illegible');
  assert.strictEqual(out.values.header.puCode, '003');
});

test('extract refuses things that are not photos', async () => {
  const ctx = makeCtx({}, { ai: { provider: 'anthropic', apiKey: 'k', model: 'm' } });
  const svg = 'data:image/svg+xml;base64,' + Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"></svg>').toString('base64');
  await assert.rejects(extractForForm(ctx, svg, { fetchImpl: okFetch('{}') }), (e) => e.code === 'bad_image');
});
