import { PARTS, size, terminals, resistorColors } from './model';
export const escape = value => String(value).replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[character]));
export function svg(tag, attributes, contents = '') {
  return '<' + tag + ' ' + Object.entries(attributes).map(([key, value]) => key + '="' + escape(value) + '"').join(' ') + '>' + contents + '</' + tag + '>';
}
export function drawing(part, view) {
  const { width: w, height: h } = size(part, view);
  const rect = (x, y, width, height, fill, radius = 3, stroke = '#18202a') => svg('rect', { x, y, width, height, fill, rx: radius, stroke, 'stroke-width': 1 });
  const line = (d, stroke = '#cad3df', thickness = 2) => svg('path', { d, stroke, 'stroke-width': thickness, fill: 'none', 'stroke-linecap': 'round', 'stroke-linejoin': 'round' });
  const text = (x, y, content, fill = '#dce8ef', fontSize = 9) => svg('text', { x, y, fill, 'font-size': fontSize, 'font-family': 'sans-serif', 'text-anchor': 'middle', stroke: 'none' }, escape(content));
  if (view === 'pcb') {
    return svg('rect', { x: 0, y: 0, width: w, height: h, rx: 3, stroke: '#e5e8bd', 'stroke-width': 1, fill: 'none' }) + text(w / 2, 18, part.label, '#e5e8bd');
  }
  if (view === 'schematic') {
    let shape;
    if (part.type === 'resistor') shape = line('M12 72V36H30V24H66V48H30V36M36 48V72');
    else if (part.type === 'led') shape = line('M12 72V32L36 44V20L12 32M36 20V72M46 20L60 6M53 6H60V13M52 34L66 20M59 20H66V27');
    else if (part.type === 'battery') shape = line('M12 72V36H30M30 16V56M42 26V46M42 36H60V60H36V72') + text(18, 19, '+');
    else if (part.type === 'button') shape = line('M0 12H22M0 60H22V12L44 2M96 12H60V60H96');
    else shape = rect(16, 20, w - 32, h - 32, '#23303b') + text(w / 2, 44, PARTS[part.type].name);
    return shape + text(w / 2, -10, part.label + (part.type === 'resistor' ? ' · ' + part.resistance + ' Ω' : ''), '#9daec0');
  }
  switch (part.type) {
    case 'breadboard':
      return rect(0, 0, w, h, '#eeede8', 7, '#c6c7c2') + rect(9, 106, w - 18, 14, '#c8cbc6', 2, '#c8cbc6') +
        line('M24 5H396', '#d87771', 1.4) + line('M24 211H396', '#6f9dcd', 1.4) +
        Array.from({ length: 30 }, (_, index) => text(36 + index * 12, 32, index + 1, '#87908d', 6)).join('') +
        Array.from('abcdefghij', (name, row) => text(16, 50 + row * 12 + (row >= 5 ? 12 : 0), name, '#87908d', 7)).join('');
    case 'uno':
      return rect(0, 0, w, h, '#188998', 8, '#52b5bc') + rect(-7, 42, 42, 44, '#c8cfd3', 3) + rect(-6, 47, 17, 34, '#69767d', 1) +
        rect(3, 124, 34, 36, '#20262d', 3) + rect(70, 66, 118, 30, '#232c32', 2) +
        Array.from({ length: 14 }, (_, i) => rect(74 + i * 8, 60, 3, 6, '#b8c2c5', 0)).join('') +
        rect(16, 3, 178, 18, '#202a31', 2) + rect(16, h - 21, 130, 18, '#202a31', 2) +
        text(132, 126, 'ARDUINO', '#e5faf8', 21) + text(132, 145, 'UNO R3', '#cfefed', 11) +
        svg('circle', { cx: 223, cy: 157, r: 5, fill: '#17232a', stroke: '#d7b963', 'stroke-width': 3 }) +
        rect(207, 40, 5, 4, '#f1c866', 1) + text(209, 35, 'ON', '#d0ece5', 6);
    case 'esp32':
      return rect(0, 0, w, h, '#202b30', 5, '#657075') + rect(24, 13, 72, 104, '#bec6c7', 3, '#e3e4df') +
        rect(24, 13, 72, 30, '#d4b86c', 1) + line('M30 18H90V24H30V30H90V36H30', '#6e633b', 2) +
        text(60, 80, 'ESP32', '#4c575b', 13) + rect(42, 210, 36, 33, '#c9cfd0', 3) +
        rect(3, 18, 18, 184, '#12191e', 2) + rect(w - 21, 18, 18, 184, '#12191e', 2);
    case 'resistor':
      return line('M0 12H96', '#b5bec6', 3) + rect(22, 2, 52, 20, '#d9c192', 8, '#bea77c') +
        resistorColors(part.resistance).map((color, index) => rect(30 + index * 10, 3, 4, 18, color, 1, color)).join('') + text(48, -9, part.label, '#aab8c8');
    case 'led':
      return line('M12 60V26M36 60V26', '#b4bdc5', 3) + rect(5, 5, 38, 34, part.color, 18) +
        rect(3, 33, 42, 7, part.color, 2) + svg('ellipse', { cx: 16, cy: 16, rx: 5, ry: 8, fill: '#ffffff65', stroke: 'none' });
    case 'battery':
      return rect(6, 12, 84, 116, '#343c48', 8) + rect(6, 12, 84, 40, '#ba8d4d', 6) +
        rect(8, 0, 12, 12, '#c0c8ce', 2) + rect(32, 0, 12, 12, '#c0c8ce', 2) +
        line('M14 5H-8V144H12', '#eb6f6a', 2) + line('M38 5H103V144H36', '#53616d', 2) +
        text(48, 87, '9V', '#e5dfca', 26) + text(48, 108, 'ALKALINE', '#a6adb5', 8);
    case 'button':
      return rect(3, 3, 42, 42, '#b7bec5', 3) + svg('circle', { cx: 24, cy: 24, r: 14, fill: '#252d35', stroke: '#6c7b87', 'stroke-width': 2 }) +
        line('M0 12H6M0 36H6M42 12H48M42 36H48', '#bdc5ce', 3);
    case 'sensor':
      return rect(4, 2, 64, 68, '#4d9dc3', 3, '#80bdd7') +
        Array.from({ length: 5 }, (_, i) => rect(12, 12 + i * 10, 48, 4, '#2e6f94', 1, '#2e6f94')).join('') + line('M24 72V84M36 72V84M48 72V84', '#bdc5ce', 3);
    default: return '';
  }
}
export function terminalDrawing(part, view, highlighted = new Set()) {
  return terminals(part, view).map(pin => {
    const key = part.id + '/' + pin.id;
    const active = highlighted.has(key);
    const radius = part.type === 'breadboard' ? 2.5 : view === 'pcb' ? 5 : 3.6;
    return svg('circle', { cx: pin.x, cy: pin.y, r: radius, fill: active ? '#79edba' : part.type === 'breadboard' ? '#63716d' : '#c6a85d', stroke: active ? '#b3ffdb' : '#233038', 'stroke-width': 1 }) +
      (view === 'pcb' ? svg('circle', { cx: pin.x, cy: pin.y, r: 2, fill: '#123b30', stroke: 'none' }) : '');
  }).join('');
}
