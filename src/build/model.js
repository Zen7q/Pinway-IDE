export const GRID = 12;
export const VIEWS = ['breadboard', 'schematic', 'pcb'];
export const snap = value => Math.round(value / GRID) * GRID;
export const clone = value => structuredClone(value);
export const PARTS = {
  breadboard: { name: 'Breadboard', category: 'Prototyping', width: 420, height: 216, prefix: 'BB' },
  uno: { name: 'Arduino Uno R3', category: 'Boards', width: 240, height: 180, prefix: 'U' },
  esp32: { name: 'ESP32 DevKit', category: 'Boards', width: 120, height: 240, prefix: 'U' },
  resistor: { name: 'Resistor', category: 'Passive', width: 96, height: 24, prefix: 'R' },
  led: { name: 'LED', category: 'Indicators', width: 48, height: 60, prefix: 'D' },
  battery: { name: '9V Battery', category: 'Power', width: 96, height: 144, prefix: 'B' },
  button: { name: 'Push button', category: 'Switches', width: 48, height: 48, prefix: 'SW' },
  sensor: { name: 'Temperature sensor', category: 'Sensors', width: 72, height: 84, prefix: 'J' },
};
export function emptyDocument() {
  return { format: 'pinway-build', version: 1, name: 'Untitled circuit', board: { width: 720, height: 480 }, parts: [], connections: [] };
}
export function newPart(type, position, existing) {
  const item = PARTS[type];
  let number = 1;
  while (existing.some(part => part.label === item.prefix + number)) number++;
  return {
    id: crypto.randomUUID(), type, label: item.prefix + number, color: '#f06a66', resistance: 1000,
    placements: Object.fromEntries(VIEWS.map(view => [view, { x: Math.max(-19000, Math.min(19000, snap(position.x))), y: Math.max(-19000, Math.min(19000, snap(position.y))), rotation: 0 }])),
  };
}
export function size(part, view) {
  if (view === 'breadboard') return { width: PARTS[part.type].width, height: PARTS[part.type].height };
  if (part.type === 'uno') return { width: 240, height: 156 };
  if (part.type === 'esp32') return { width: 120, height: 240 };
  return { width: 96, height: 72 };
}
export function terminals(part, view = 'breadboard') {
  const { width, height } = size(part, view);
  if (part.type === 'breadboard') {
    if (view !== 'breadboard') return [];
    const holes = [];
    for (let column = 0; column < 30; column++) {
      for (let row = 0; row < 10; row++) {
        holes.push({ id: 'h' + row + '-' + column, x: 36 + column * GRID, y: 48 + row * GRID + (row >= 5 ? 12 : 0), group: (row < 5 ? 'upper' : 'lower') + column, name: 'abcdefghij'[row] + (column + 1) });
      }
      for (let rail = 0; rail < 2; rail++) {
        holes.push({ id: 'rail' + rail + '-' + column, x: 36 + column * GRID, y: rail ? 204 : 12, group: 'rail' + rail, name: rail ? 'GND rail' : 'Power rail' });
      }
    }
    return holes;
  }
  if (part.type === 'uno') return [
    ...Array.from({ length: 14 }, (_, i) => ({ id: 'D' + i, x: 24 + i * GRID, y: 12 })),
    ...['VIN', '5V', '3V3', 'GND', 'A0', 'A1', 'A2', 'A3', 'A4', 'A5'].map((id, i) => ({ id, x: 24 + i * GRID, y: height - 12 })),
  ];
  if (part.type === 'esp32') return Array.from({ length: 30 }, (_, index) => ({
    id: ['3V3', 'EN', 'VP', 'VN', 'GPIO34', 'GPIO35', 'GPIO32', 'GPIO33', 'GPIO25', 'GPIO26', 'GPIO27', 'GPIO14', 'GPIO12', 'GND', 'VIN',
      'GND', 'GPIO23', 'GPIO22', 'TX', 'RX', 'GPIO21', 'GPIO19', 'GPIO18', 'GPIO5', 'GPIO17', 'GPIO16', 'GPIO4', 'GPIO2', 'GPIO15', '3V3B'][index],
    x: index < 15 ? 12 : width - 12, y: 24 + (index % 15) * GRID,
  }));
  if (part.type === 'sensor') return ['VCC', 'DATA', 'GND'].map((id, i) => ({ id, x: 24 + i * GRID, y: height }));
  if (part.type === 'button') return [
    { id: '1', x: 0, y: 12, group: 'left' }, { id: '2', x: width, y: 12, group: 'right' },
    { id: '3', x: 0, y: height - 12, group: 'left' }, { id: '4', x: width, y: height - 12, group: 'right' },
  ];
  const names = part.type === 'led' ? ['A', 'K'] : part.type === 'battery' ? ['+', '-'] : ['1', '2'];
  return names.map((id, i) => ({ id, x: view === 'breadboard' && part.type === 'resistor' ? i * width : 12 + i * 24, y: view === 'breadboard' && part.type === 'resistor' ? 12 : height }));
}
export function pinPosition(part, pin, view) {
  const placement = part.placements[view];
  const { width, height } = size(part, view);
  const center = { x: snap(width / 2), y: snap(height / 2) };
  const angle = placement.rotation * Math.PI / 180;
  const x = pin.x - center.x;
  const y = pin.y - center.y;
  return { x: Math.round(placement.x + center.x + x * Math.cos(angle) - y * Math.sin(angle)), y: Math.round(placement.y + center.y + x * Math.sin(angle) + y * Math.cos(angle)) };
}
export function endpoint(document, ref, view) {
  const part = document.parts.find(item => item.id === ref.part);
  const pin = part && terminals(part, view).find(item => item.id === ref.pin);
  return pin ? pinPosition(part, pin, view) : null;
}
export function electricalNets(document) {
  const points = document.parts.flatMap(part => terminals(part).map(pin => ({
    key: part.id + '/' + pin.id, part: part.id, pin: pin.id,
    group: pin.group && part.id + '/' + pin.group, ...pinPosition(part, pin, 'breadboard'),
  })));
  const parents = new Map(points.map(point => [point.key, point.key]));
  function root(key) {
    let value = key;
    while (parents.get(value) !== value) value = parents.get(value);
    return value;
  }
  function join(a, b) {
    if (parents.has(a) && parents.has(b)) parents.set(root(a), root(b));
  }
  const groups = new Map();
  const locations = new Map();
  for (const point of points) {
    if (point.group) {
      if (groups.has(point.group)) join(point.key, groups.get(point.group));
      else groups.set(point.group, point.key);
    }
    const location = point.x + ',' + point.y;
    if (locations.has(location)) join(point.key, locations.get(location));
    else locations.set(location, point.key);
  }
  for (const connection of document.connections) join(connection.from.part + '/' + connection.from.pin, connection.to.part + '/' + connection.to.pin);
  const nets = new Map();
  for (const point of points) {
    const key = root(point.key);
    if (!nets.has(key)) nets.set(key, []);
    nets.get(key).push(point);
  }
  return [...nets.values()];
}
export function resistorColors(resistance) {
  const colors = ['#171a20', '#875234', '#de4e4e', '#ed933c', '#e5cb54', '#52a976', '#4d84d1', '#ad79cf', '#a2a7ae', '#f5f3eb'];
  let exponent = Math.floor(Math.log10(resistance)) - 1;
  let significant = Math.round(resistance / 10 ** exponent);
  if (significant === 100) { significant = 10; exponent++; }
  return [colors[Math.floor(significant / 10)], colors[significant % 10], exponent < 0 ? '#c9aa5d' : colors[exponent], '#c9aa5d'];
}
export function validate(input) {
  const fail = () => { throw Error('This is not a valid Pinway Build document.'); };
  if (!input || input.format !== 'pinway-build' || input.version !== 1 || typeof input.name !== 'string' || input.name.length > 160) fail();
  if (!Array.isArray(input.parts) || !Array.isArray(input.connections) || input.parts.length > 300 || input.connections.length > 2000) fail();
  const finite = value => typeof value === 'number' && Number.isFinite(value) && Math.abs(value) <= 20000;
  if (!input.board || ![input.board.width, input.board.height].every(value => finite(value) && value >= 120 && value <= 2400)) fail();
  const ids = new Set();
  const id = value => typeof value === 'string' && /^[a-zA-Z0-9_-]{1,80}$/.test(value);
  const color = value => typeof value === 'string' && /^#[0-9a-f]{6}$/i.test(value);
  for (const part of input.parts) {
    if (!Object.hasOwn(PARTS, part.type) || !id(part.id) || ids.has(part.id) || typeof part.label !== 'string' || part.label.length > 80 || !color(part.color) || !finite(part.resistance) || part.resistance < 1 || part.resistance > 9900000) fail();
    ids.add(part.id);
    if (!part.placements || !VIEWS.every(view => part.placements[view] && finite(part.placements[view].x) && finite(part.placements[view].y) && [0, 90, 180, 270].includes(part.placements[view].rotation))) fail();
  }
  for (const connection of input.connections) {
    if (!id(connection.id) || ids.has(connection.id) || !color(connection.color)) fail();
    ids.add(connection.id);
    if (connection.routed !== undefined && (typeof connection.routed !== 'object' || connection.routed === null || typeof connection.routed.pcb !== 'boolean')) fail();
    if (![connection.from, connection.to].every(ref => ref && endpoint(input, ref, 'breadboard'))) fail();
    if (!connection.routes || !VIEWS.every(view => Array.isArray(connection.routes[view]) && connection.routes[view].length <= 100 && connection.routes[view].every(point => point && finite(point.x) && finite(point.y)))) fail();
  }
  return clone(input);
}
