export function parseCSV(text) {
  if (typeof text !== 'string') throw new Error('CSV має бути текстом');
  text = text.replace(/^\uFEFF/, '');
  const rows = [];
  let row = [], field = '', quoted = false, closed = false, started = false;
  const pushField = () => { row.push(field); field = ''; closed = false; started = false; };
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c !== '"') field += c;
      else if (text[i + 1] === '"') { field += '"'; i++; }
      else { quoted = false; closed = true; }
      continue;
    }
    if (c === ',') pushField();
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++;
      pushField(); rows.push(row); row = [];
    } else if (c === '"' && !started && !closed) { quoted = true; started = true; }
    else {
      if (closed || c === '"') throw new Error(`CSV: запис ${rows.length + 1}, поле ${row.length + 1}: некоректні лапки`);
      field += c; started = true;
    }
  }
  if (quoted) throw new Error(`CSV: запис ${rows.length + 1}: незакриті лапки`);
  if (started || closed || row.length) { pushField(); rows.push(row); }
  return rows;
}
