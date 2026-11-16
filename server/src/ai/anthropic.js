// Reads a result sheet photo with an AI model (Anthropic Messages API) and returns the
// JSON the AI wrote. The AI only COPIES what is printed or written on the sheet.
// Everything it returns is checked and shown to the agent, who must confirm every number.
const { HttpError } = require('../middleware/errors');
const { PARTIES } = require('../config/elections');

const SYSTEM = `You read photos of Nigerian election result sheets (Form EC8A).
Write down exactly what is on the sheet, even if it looks wrong.
Never add up, correct or guess any number. If a field cannot be read, use null.
Dashes around numbers such as -03- are decoration: the number is 3. A lone dash means 0.
For each field say how readable it is: "clear", "unclear" or "illegible".
Return ONLY one JSON object, with no other text.`;

function instruction(parties) {
  return `Read this result sheet. The party rows are: ${parties.join(', ')}.
Return JSON in exactly this shape:
{
  "header": { "state_code": "", "lga_code": "", "ra_code": "", "pu_code": "", "serial_no": "" },
  "counts": {
    "registered": {"v": 0, "l": "clear"}, "accredited": {"v": 0, "l": "clear"}, "issued": {"v": 0, "l": "clear"},
    "unused": {"v": 0, "l": "clear"}, "spoiled": {"v": 0, "l": "clear"}, "rejected": {"v": 0, "l": "clear"},
    "valid_total": {"v": 0, "l": "clear"}, "used_total": {"v": 0, "l": "clear"}
  },
  "parties": [ {"party": "NAME", "figures": 0, "words": "votes written in words", "l": "clear"} ],
  "total_valid_row": {"figures": 0, "words": "", "l": "clear"},
  "image_quality": "ok"
}
registered=#1, accredited=#2, issued=#3, unused=#4, spoiled=#5, rejected=#6, valid_total=#7, used_total=#8.
image_quality is "ok", "poor" (blurry, cut off, covered) or "blank".`;
}

function pickJson(text) {
  const cleaned = String(text).replace(/```json|```/g, '');
  const start = cleaned.indexOf('{');
  const end = cleaned.lastIndexOf('}');
  if (start < 0 || end <= start) throw new Error('no json');
  return JSON.parse(cleaned.slice(start, end + 1));
}

async function readSheet({ config, buffer, mime, fetchImpl = fetch }) {
  const { apiKey, model } = config.ai;
  const body = {
    model,
    max_tokens: 2000,
    system: SYSTEM,
    messages: [{
      role: 'user',
      content: [
        { type: 'image', source: { type: 'base64', media_type: mime, data: buffer.toString('base64') } },
        { type: 'text', text: instruction(PARTIES) },
      ],
    }],
  };
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 60000);
  let response;
  try {
    response = await fetchImpl('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
  } catch (err) {
    throw new HttpError(502, 'ai_failed', 'The AI service could not be reached. Please type the numbers.');
  } finally {
    clearTimeout(timer);
  }
  if (!response.ok) {
    console.error('AI service returned status', response.status); // never log the key
    throw new HttpError(502, 'ai_failed', 'The AI service could not read the photo. Please type the numbers.');
  }
  let data;
  try {
    data = await response.json();
    const text = (data.content || []).filter((b) => b.type === 'text').map((b) => b.text).join('\n');
    return pickJson(text);
  } catch (err) {
    throw new HttpError(502, 'ai_bad_answer', 'The AI answer could not be understood. Please type the numbers.');
  }
}

module.exports = { readSheet, pickJson, instruction };
