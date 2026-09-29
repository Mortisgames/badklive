// One matching rule for validation and parsing, including localized header suffixes.
export const matchesColumn = (header, name) => header === name || header.startsWith(name + ' ') || header.startsWith(name + '/');
export const columnIndex = (headers, name) => headers.findIndex(h => matchesColumn(h.trim(), name));
