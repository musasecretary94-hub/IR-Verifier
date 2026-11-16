// Export and import of the polling-unit registry as a CSV file (opens in Excel).
//
//   columns: code, name, ward, lga, state, registered
//   - "code" and "registered" are always needed.
//   - name/ward/lga/state are needed only for NEW polling units.
//   - extra columns are ignored.
// Import is all-or-nothing: if ONE row has a problem, NOTHING is changed.
const { transaction } = require('./connection');
const audit = require('../services/audit');

const MAX_ROWS = 300000;
const MAX_REGISTERED = 5000000;
const CODE_RE = /^[A-Za-z0-9._-]{1,30}$/;
const PLACE_FIELDS = ['name', 'ward', 'lga', 'state'];

// ---------- reading a CSV (quotes, commas inside names, Excel BOM, Windows line ends, ; separator) ----------
function parseCsv(input) {
  let text = String(input);
  if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);
  const first = text.split(/\r?\n/, 1)[0];
  const delimiter = first.includes(',') ? ',' : first.includes(';') ? ';' : ',';

  const rows = [];
  let row = [];
  let field = '';
  let quoted = false;
  let line = 1;
  let startLine = 1;
  let fresh = true;
  const push = () => {
    row.push(field);
    if (row.some((c) => c.trim() !== '')) rows.push({ cells: row, line: startLine });
    row = [];
    field = '';
    fresh = true;
  };
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (fresh) { startLine = line; fresh = false; }
    if (quoted) {
      if (ch === '"') {
        if (text[i + 1] === '"') { field += '"'; i++; } else quoted = false;
      } else {
        if (ch === '\n') line++;
        field += ch;
      }
    } else if (ch === '"' && field === '') {
      quoted = true;
    } else if (ch === delimiter) {
      row.push(field);
      field = '';
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && text[i + 1] === '\n') i++;
      line++;
      push();
    } else {
      field += ch;
    }
    if (rows.length > MAX_ROWS + 1) throw new Error('The file has too many rows (maximum ' + MAX_ROWS + ')');
  }
  if (quoted) throw new Error('The file has a quote (") that is never closed');
  if (field !== '' || row.length) push();
  return rows;
}

const csvCell = (v) => {
  const s = String(v ?? '');
  return /[",\r\n;]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
};

function exportRegistryCsv(db) {
  const rows = db.prepare('SELECT code, name, ward, lga, state, registered FROM polling_units ORDER BY id').all();
  const lines = ['code,name,ward,lga,state,registered'];
  rows.forEach((r) => lines.push([r.code, r.name, r.ward, r.lga, r.state, r.registered].map(csvCell).join(',')));
  return lines.join('\n') + '\n';
}

// ---------- planning (changes nothing) ----------
function planImport(db, text) {
  const plan = { errors: [], warnings: [], changes: [], ops: [], summary: { rows: 0, newUnits: 0, registeredChanged: 0, placeChanged: 0, unchanged: 0, notInFile: 0, changedWithResults: 0 } };
  const fail = (line, message) => plan.errors.push({ line, message });

  let rows;
  try {
    rows = parseCsv(text);
  } catch (e) {
    fail(0, e.message);
    return plan;
  }
  if (rows.length === 0) { fail(0, 'The file is empty'); return plan; }

  const header = rows[0].cells.map((h) => h.trim().toLowerCase());
  const col = Object.fromEntries(['code', 'registered', ...PLACE_FIELDS].map((k) => [k, header.indexOf(k)]));
  if (col.code < 0) fail(1, 'The first line must have a column named "code"');
  if (col.registered < 0) fail(1, 'The first line must have a column named "registered"');
  if (plan.errors.length) return plan;

  const seen = new Set();
  let matched = 0;
  const get = db.prepare('SELECT * FROM polling_units WHERE code = ?');
  const countResults = db.prepare('SELECT COUNT(*) AS n FROM submissions WHERE polling_unit_id = ?');

  rows.slice(1).forEach(({ cells, line }) => {
    plan.summary.rows++;
    const cell = (i) => (i >= 0 && i < cells.length ? cells[i].trim() : '');
    const code = cell(col.code);
    const regText = cell(col.registered).replace(/\s/g, '');

    if (!CODE_RE.test(code)) return fail(line, `Bad polling unit code "${code}" (use letters, numbers, - . _ only, up to 30)`);
    if (seen.has(code)) return fail(line, `The code ${code} appears more than once in the file`);
    seen.add(code);
    if (!/^\d+$/.test(regText)) return fail(line, `${code}: "registered" must be a whole number (got "${cell(col.registered)}")`);
    const registered = Number(regText);
    if (registered > MAX_REGISTERED) return fail(line, `${code}: "registered" is too large`);

    const place = {};
    for (const f of PLACE_FIELDS) {
      const v = cell(col[f]);
      if (v.length > 80) return fail(line, `${code}: "${f}" is too long (maximum 80 letters)`);
      if (/[\u0000-\u001f]/.test(v)) return fail(line, `${code}: "${f}" has strange characters`);
      place[f] = v;
    }

    const existing = get.get(code);
    if (!existing) {
      const missing = PLACE_FIELDS.filter((f) => !place[f]);
      if (missing.length) return fail(line, `${code} is a NEW polling unit, so these columns must be filled: ${missing.join(', ')}`);
      plan.ops.push({ type: 'insert', unit: { code, ...place, registered } });
      plan.changes.push({ code, kind: 'new', to: registered });
      plan.summary.newUnits++;
      return;
    }

    matched++;
    const hasResults = countResults.get(existing.id).n > 0;
    const placeChanges = PLACE_FIELDS.filter((f) => place[f] && place[f] !== existing[f]);
    if (placeChanges.length && hasResults) {
      return fail(line, `${code} already has results, so its ${placeChanges.join(', ')} cannot be changed`);
    }
    const fields = {};
    if (registered !== existing.registered) fields.registered = registered;
    placeChanges.forEach((f) => { fields[f] = place[f]; });

    if (Object.keys(fields).length === 0) { plan.summary.unchanged++; return; }
    plan.ops.push({ type: 'update', code, fields });
    if ('registered' in fields) {
      plan.changes.push({ code, kind: 'registered', from: existing.registered, to: registered });
      plan.summary.registeredChanged++;
      if (hasResults) {
        plan.summary.changedWithResults++;
        plan.warnings.push(`${code} already has results: they keep the number that was sent (${existing.registered}). Only new submissions use ${registered}.`);
      }
    }
    if (placeChanges.length) {
      plan.changes.push({ code, kind: 'place', to: placeChanges.map((f) => `${f}: ${existing[f]} -> ${place[f]}`).join('; ') });
      plan.summary.placeChanged++;
    }
  });

  plan.summary.notInFile = db.prepare('SELECT COUNT(*) AS n FROM polling_units').get().n - matched;
  return plan;
}

// ---------- applying (all or nothing) ----------
function applyImport(db, plan, { fileName = null } = {}) {
  if (plan.errors.length) throw new Error('The file has errors, so nothing was changed');
  transaction(db, () => {
    plan.ops.forEach((op) => {
      if (op.type === 'insert') {
        const u = op.unit;
        db.prepare('INSERT INTO polling_units (code, name, ward, lga, state, registered) VALUES (?, ?, ?, ?, ?, ?)').run(u.code, u.name, u.ward, u.lga, u.state, u.registered);
      } else {
        const keys = Object.keys(op.fields);
        db.prepare(`UPDATE polling_units SET ${keys.map((k) => k + ' = ?').join(', ')} WHERE code = ?`).run(...keys.map((k) => op.fields[k]), op.code);
      }
    });
    audit.record(db, { user: null, action: 'registry.import', detail: { file: fileName, ...plan.summary } });
  });
  return plan.summary;
}

module.exports = { parseCsv, exportRegistryCsv, planImport, applyImport };
