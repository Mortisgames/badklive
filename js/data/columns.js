// One matching rule for validation and parsing, including localized header suffixes.
export const matchesColumn = (header, name) => header === name || header.startsWith(name + ' ') || header.startsWith(name + '/');
export const columnIndex = (headers, name) => headers.findIndex(h => matchesColumn(h.trim(), name));
// The sheet renamed «Історична база» to «Згладжена історична база»; accept both.
const ALIASES = { 'Історична база': ['Згладжена історична база'] };
export const exactIndex = (headers, name) => [name, ...(ALIASES[name] ?? [])].map(n => headers.indexOf(n)).find(i => i >= 0) ?? -1;
