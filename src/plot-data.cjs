const number = '[+-]?(?:\\d+(?:\\.\\d*)?|\\.\\d+)(?:[eE][+-]?\\d+)?';
const field = new RegExp('(?:(?<label>[A-Za-z_][\\w.-]*):)?(?<value>' + number + ')', 'y');

function parsePlotLine(line) {
  const text = line.trim();
  if (!text) return [];
  const values = [];
  const labels = new Set();
  let offset = 0;
  while (offset < text.length) {
    field.lastIndex = offset;
    const match = field.exec(text);
    if (!match) return [];
    const value = Number(match.groups.value);
    const label = match.groups.label || `Канал ${values.length + 1}`;
    if (!Number.isFinite(value) || labels.has(label) || values.length === 8) return [];
    labels.add(label);
    values.push({ label, value });
    offset = field.lastIndex;
    if (offset < text.length) {
      const separator = text.slice(offset).match(/^(?:\s*,\s*|\s+)/);
      if (!separator) return [];
      offset += separator[0].length;
      if (offset === text.length) return [];
    }
  }
  return values;
}

module.exports = { parsePlotLine };
