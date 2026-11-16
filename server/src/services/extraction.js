// Step 1 (EXTRACT): AI reads the photo. The result is only a SUGGESTION for the agent's form.
const { HttpError } = require('../middleware/errors');
const { decodeBase64Image, detectImageType } = require('../security/images');
const { normalizeSheet } = require('./normalize');
const { sheetToValues } = require('./values');

function aiAvailable(config) {
  return config.ai.provider === 'anthropic' && Boolean(config.ai.apiKey);
}

async function extractForForm(ctx, image, { fetchImpl } = {}) {
  const { config } = ctx;
  if (!aiAvailable(config)) throw new HttpError(503, 'ai_not_configured', 'Reading with AI is not set up. Please type the numbers.');
  let buffer;
  try {
    buffer = decodeBase64Image(image, config.maxImageMb * 1024 * 1024);
  } catch (e) {
    throw new HttpError(400, 'bad_image', 'The photo could not be read');
  }
  const type = detectImageType(buffer);
  if (!type) throw new HttpError(400, 'bad_image', 'Only JPEG, PNG or WebP photos are accepted');

  const { readSheet } = require('../ai/anthropic');
  const raw = await readSheet({ config, buffer, mime: type.mime, fetchImpl });
  const { sheet, notes } = normalizeSheet(raw);
  return {
    values: sheetToValues(sheet),
    readability: sheet.readability,
    imageQuality: sheet.imageQuality || null,
    notes,
  };
}

module.exports = { extractForForm, aiAvailable };
