import { GRID, PARTS, VIEWS, snap, clone, emptyDocument, newPart, size, terminals, pinPosition, endpoint, electricalNets, validate } from './model';
import { drawing, terminalDrawing, svg, escape } from './parts';
import './style.css';

export function createBuild({ call, activateCode }) {
  const root = document.createElement('main');
  root.id = 'build-workspace';
  root.hidden = true;
  root.innerHTML = `
    <div class="build-filebar">
      <label class="build-document"><input id="build-name" aria-label="Circuit name" maxlength="160" value="Untitled circuit"><span id="build-save-state">Local draft</span></label>
      <div class="build-file-actions"><button data-command="new">New</button><button data-command="open">Open…</button><button data-command="save">Save</button><button data-command="export">Export image</button></div>
    </div>
    <div class="build-body">
      <nav class="build-rail" aria-label="Build modes">
        <button data-view="breadboard" aria-label="Breadboard" title="Breadboard" aria-pressed="true"><svg><use href="#i-pins"></use></svg></button>
        <button data-view="schematic" aria-label="Schematic" title="Schematic" aria-pressed="false"><svg><use href="#i-activity"></use></svg></button>
        <button data-view="pcb" aria-label="PCB" title="PCB" aria-pressed="false"><svg><use href="#i-chip"></use></svg></button>
        <span class="spacer"></span><button data-command="settings" aria-label="Settings" title="Settings"><svg><use href="#i-settings"></use></svg></button>
      </nav>
      <aside class="build-library" aria-label="Components">
        <div class="build-library-heading"><strong>Components</strong><button data-command="toggle-library" title="Collapse component library" aria-label="Collapse component library">‹</button></div>
        <input id="build-search" type="search" placeholder="Search components" aria-label="Search components">
        <div id="build-library-list"></div>
      </aside>
      <section class="build-editor">
        <div class="build-editorbar">
          <button data-command="toggle-library" class="build-library-toggle" aria-label="Show components">Components</button>
          <strong id="build-view-name">Breadboard</strong><span class="build-grid-label">2.54 mm grid</span><span class="spacer"></span>
          <button data-command="undo" aria-label="Undo" title="Undo · ⌘Z"><svg><use href="#i-back"></use></svg></button>
          <button data-command="redo" aria-label="Redo" title="Redo · ⇧⌘Z">↪</button>
        </div>
        <div class="build-toolbar">
          <button data-tool="select" aria-pressed="true">Select</button><button data-tool="wire" aria-pressed="false">Wire</button>
          <input id="build-wire-color" type="color" value="#ef7069" aria-label="New wire color" title="New wire color">
          <span class="build-divider"></span><button data-command="rotate" title="Rotate · R">Rotate</button><button data-command="duplicate" title="Duplicate · ⌘D">Duplicate</button><button data-command="delete" title="Delete">Delete</button>
          <span class="spacer"></span><button data-command="zoom-out" aria-label="Zoom out">−</button><button data-command="fit" id="build-zoom" title="Fit content">100%</button><button data-command="zoom-in" aria-label="Zoom in">+</button>
        </div>
        <div class="build-canvas" tabindex="0" aria-label="Circuit canvas">
          <svg id="build-svg" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Electronic circuit"></svg>
          <div class="build-empty"><svg><use href="#i-pins"></use></svg><h2>Your next circuit starts here</h2><p>Drag a component from the library, then connect its terminals.</p><button data-command="example">Start with an LED circuit</button></div>
        </div>
        <footer class="build-footer"><span id="build-status" role="status">Ready</span><span id="build-count">0 components</span></footer>
      </section>
      <aside class="build-inspector" aria-label="Properties">
        <div class="build-inspector-heading">Properties</div><div id="build-properties"></div>
        <section class="build-board-settings"><h3>Board dimensions</h3><label>Width <span><input id="build-board-width" type="number" min="25.4" max="508" step="2.54" aria-label="Board width"> mm</span></label><label>Height <span><input id="build-board-height" type="number" min="25.4" max="508" step="2.54" aria-label="Board height"> mm</span></label><p>Single copper layer. Dashed lines show connections waiting to be routed.</p></section>
      </aside>
    </div>`;
  document.querySelector('.statusbar').before(root);
  const $ = id => root.querySelector('#' + id);
  const canvas = root.querySelector('.build-canvas');
  const scene = $('build-svg');
  let documentData = emptyDocument();
  let view = 'breadboard';
  let selected = null;
  let tool = 'select';
  let enabled = false;
  let pendingWire = null;
  let hovering = null;
  let gesture = null;
  let spaceHeld = false;
  let clipboard = null;
  let filePath = null;
  let saveSnapshot = JSON.stringify(documentData);
  let savedToFile = false;
  let undoStack = [];
  let redoStack = [];
  let camera = { x: -48, y: -48, scale: 1 };
  let ioBusy = false;
  let ready = false;
  let restoringError = '';
  let draftTimer;
  let netCache;
  let draftQueue = Promise.resolve();

  const message = text => { $('build-status').textContent = text; };
  const selection = () => documentData.parts.find(part => part.id === selected) || documentData.connections.find(connection => connection.id === selected);
  const dirty = () => JSON.stringify(documentData) !== saveSnapshot || (!savedToFile && documentData.parts.length > 0);
  function snapshot() { return JSON.stringify(documentData); }
  function nets() {
    if (!netCache) netCache = electricalNets(documentData);
    return netCache;
  }
  function updateFileState() {
    $('build-save-state').textContent = ioBusy ? 'Saving…' : dirty() ? 'Unsaved changes · draft kept' : savedToFile ? 'Saved' : 'Local draft';
  }
  function queueDraft() {
    clearTimeout(draftTimer);
    draftTimer = setTimeout(() => {
      const content = snapshot();
      draftQueue = draftQueue.catch(() => {}).then(() => call('buildDraft', { content, path: filePath })).catch(error => message('Draft could not be saved: ' + error.message));
    }, 250);
  }
  function record(before) {
    undoStack.push(before);
    if (undoStack.length > 100) undoStack.shift();
    redoStack = [];
  }
  function changed() {
    netCache = null;
    updateFileState();
    queueDraft();
    render();
  }
  function edit(operation) {
    if (!ready || ioBusy) return;
    const before = clone(documentData);
    operation();
    if (JSON.stringify(before) !== snapshot()) record(before);
    changed();
  }
  function setView(next) {
    view = next;
    pendingWire = null;
    hovering = null;
    for (const button of root.querySelectorAll('[data-view]')) button.setAttribute('aria-pressed', String(button.dataset.view === view));
    $('build-view-name').textContent = { breadboard: 'Breadboard', schematic: 'Schematic', pcb: 'PCB' }[view];
    root.querySelector('[data-tool="wire"]').textContent = view === 'pcb' ? 'Trace' : 'Wire';
    root.classList.toggle('build-pcb', view === 'pcb');
    render();
  }
  function add(type, point) {
    if (documentData.parts.length >= 300) return message('The component limit is 300.');
    edit(() => {
      const part = newPart(type, point, documentData.parts);
      documentData.parts.push(part);
      selected = part.id;
    });
    message(PARTS[type].name + ' added. Drag to place; press R to rotate.');
  }
  function world(event) {
    const bounds = canvas.getBoundingClientRect();
    return { x: camera.x + (event.clientX - bounds.left) / camera.scale, y: camera.y + (event.clientY - bounds.top) / camera.scale };
  }
  function zoom(factor, anchor = { x: canvas.clientWidth / 2, y: canvas.clientHeight / 2 }) {
    const previous = camera.scale;
    camera.scale = Math.max(0.15, Math.min(5, previous * factor));
    camera.x += anchor.x / previous - anchor.x / camera.scale;
    camera.y += anchor.y / previous - anchor.y / camera.scale;
    drawScene();
  }
  function fit() {
    const placements = documentData.parts.filter(part => view === 'breadboard' || part.type !== 'breadboard').map(part => {
      const placement = part.placements[view];
      const dimensions = size(part, view);
      return { x: placement.x - 24, y: placement.y - 24, right: placement.x + Math.max(dimensions.width, dimensions.height) + 24, bottom: placement.y + Math.max(dimensions.width, dimensions.height) + 24 };
    });
    if (!placements.length) { camera = { x: -48, y: -48, scale: 1 }; drawScene(); return; }
    const left = Math.min(...placements.map(part => part.x));
    const top = Math.min(...placements.map(part => part.y));
    const width = Math.max(...placements.map(part => part.right)) - left;
    const height = Math.max(...placements.map(part => part.bottom)) - top;
    camera.scale = Math.max(0.15, Math.min(1.5, canvas.clientWidth / (width + 96), canvas.clientHeight / (height + 96)));
    camera.x = left - (canvas.clientWidth / camera.scale - width) / 2;
    camera.y = top - (canvas.clientHeight / camera.scale - height) / 2;
    drawScene();
  }
  function wirePath(connection) {
    const first = endpoint(documentData, connection.from, view);
    const last = endpoint(documentData, connection.to, view);
    if (!first || !last) return '';
    const points = [first, ...connection.routes[view], last];
    if (view !== 'breadboard') return points.map((point, index) => index ? 'H' + point.x + 'V' + point.y : 'M' + point.x + ',' + point.y).join(' ');
    let path = 'M' + first.x + ',' + first.y;
    for (let index = 1; index < points.length - 1; index++) {
      const before = points[index - 1], corner = points[index], after = points[index + 1];
      const lengthA = Math.hypot(corner.x - before.x, corner.y - before.y);
      const lengthB = Math.hypot(after.x - corner.x, after.y - corner.y);
      if (!lengthA || !lengthB) continue;
      const radius = Math.min(10, lengthA / 2, lengthB / 2);
      path += 'L' + (corner.x + (before.x - corner.x) * radius / lengthA) + ',' + (corner.y + (before.y - corner.y) * radius / lengthA);
      path += 'Q' + corner.x + ',' + corner.y + ' ' + (corner.x + (after.x - corner.x) * radius / lengthB) + ',' + (corner.y + (after.y - corner.y) * radius / lengthB);
    }
    return path + 'L' + last.x + ',' + last.y;
  }
  function projectedConnections() {
    if (view === 'breadboard') return '';
    const result = [];
    for (const net of nets()) {
      const contacts = net.filter(point => documentData.parts.find(part => part.id === point.part)?.type !== 'breadboard');
      for (let index = 1; index < contacts.length; index++) {
        const first = contacts[index - 1], last = contacts[index];
        const explicitlyWired = documentData.connections.some(connection => [connection.from, connection.to].some(ref => ref.part === first.part && ref.pin === first.pin) && [connection.from, connection.to].some(ref => ref.part === last.part && ref.pin === last.pin));
        if (explicitlyWired) continue;
        const a = endpoint(documentData, first, view), b = endpoint(documentData, last, view);
        if (!a || !b) continue;
        result.push(svg('path', { d: 'M' + a.x + ',' + a.y + 'H' + b.x + 'V' + b.y, fill: 'none', stroke: view === 'pcb' ? '#d7bc79' : '#99b8c5', 'stroke-width': 1.5, 'stroke-dasharray': view === 'pcb' ? '5 5' : 'none', 'pointer-events': 'none' }));
      }
    }
    return result.join('');
  }
  function renderDrawing(forExport = false) {
    const output = [];
    if (view === 'pcb') output.push(svg('rect', { x: 0, y: 0, width: documentData.board.width, height: documentData.board.height, rx: 6, fill: '#153e32', stroke: '#6c9d83', 'stroke-width': 2 }));
    const highlight = !forExport && hovering ? new Set((nets().find(net => net.some(point => point.part === hovering.part && point.pin === hovering.pin)) || []).map(point => point.key)) : new Set();
    const parts = [...documentData.parts].sort((a, b) => Number(b.type === 'breadboard') - Number(a.type === 'breadboard'));
    for (const part of parts) {
      if (part.type === 'breadboard' && view !== 'breadboard') continue;
      const placement = part.placements[view], dimensions = size(part, view);
      let content = drawing(part, view) + terminalDrawing(part, view, highlight);
      if (!forExport && part.id === selected) content += svg('rect', { x: -7, y: -7, width: dimensions.width + 14, height: dimensions.height + 14, fill: 'none', stroke: 'var(--accent)', 'stroke-width': 1.5, 'stroke-dasharray': '4 3', rx: 5 });
      output.push(svg('g', { 'data-part-id': part.id, transform: 'translate(' + placement.x + ' ' + placement.y + ') rotate(' + placement.rotation + ' ' + snap(dimensions.width / 2) + ' ' + snap(dimensions.height / 2) + ')' }, content));
    }
    output.push(projectedConnections());
    for (const connection of documentData.connections) {
      const path = wirePath(connection);
      if (!path) continue;
      output.push(svg('path', { 'data-connection-id': connection.id, d: path, fill: 'none', stroke: connection.color, 'stroke-width': view === 'pcb' ? connection.routed?.pcb ? 5 : 1.5 : 3.5, 'stroke-linejoin': 'round', 'stroke-linecap': 'round', 'stroke-dasharray': view === 'pcb' && !connection.routed?.pcb ? '5 5' : 'none', opacity: view === 'pcb' && !connection.routed?.pcb ? 0.65 : 1 }));
      if (!forExport) {
        output.push(svg('path', { 'data-connection-id': connection.id, d: path, fill: 'none', stroke: 'transparent', 'stroke-width': 14 }));
        if (selected === connection.id) {
          connection.routes[view].forEach((point, index) => output.push(svg('circle', { 'data-bend-index': index, 'data-connection-id': connection.id, cx: point.x, cy: point.y, r: 5, fill: 'var(--accent)', stroke: '#111b24', 'stroke-width': 2 })));
        }
      }
    }
    if (!forExport) {
      for (const part of parts) {
        if (part.type === 'breadboard' && view !== 'breadboard') continue;
        for (const pin of terminals(part, view)) {
          const position = pinPosition(part, pin, view);
          output.push(svg('circle', { 'data-terminal-part': part.id, 'data-terminal-pin': pin.id, cx: position.x, cy: position.y, r: part.type === 'breadboard' ? 4 : 6, fill: 'transparent', stroke: 'none' }, svg('title', {}, escape(part.label + ' · ' + (pin.name || pin.id)))));
        }
      }
      if (pendingWire) {
        const start = endpoint(documentData, pendingWire.from, view);
        if (start) {
          const points = [start, ...pendingWire.bends, ...(pendingWire.cursor ? [pendingWire.cursor] : [])];
          output.push(svg('path', { d: points.map((point, index) => (index ? 'L' : 'M') + point.x + ',' + point.y).join(' '), stroke: $('build-wire-color').value, 'stroke-width': 3, 'stroke-dasharray': '5 4', fill: 'none', 'pointer-events': 'none' }));
        }
      }
    }
    return output.join('');
  }
  function drawScene() {
    const width = Math.max(canvas.clientWidth, 1) / camera.scale;
    const height = Math.max(canvas.clientHeight, 1) / camera.scale;
    scene.setAttribute('viewBox', [camera.x, camera.y, width, height].join(' '));
    scene.innerHTML = '<defs><pattern id="build-grid" width="12" height="12" patternUnits="userSpaceOnUse"><circle cx="0" cy="0" r="0.65" fill="#536378"/></pattern></defs>' +
      svg('rect', { x: camera.x, y: camera.y, width, height, fill: 'url(#build-grid)' }) + renderDrawing();
    $('build-zoom').textContent = Math.round(camera.scale * 100) + '%';
    root.querySelector('.build-empty').hidden = documentData.parts.length > 0;
    $('build-count').textContent = documentData.parts.length + ' components · ' + documentData.connections.length + ' connections';
    root.querySelector('[data-command="undo"]').disabled = !undoStack.length;
    root.querySelector('[data-command="redo"]').disabled = !redoStack.length;
    for (const command of ['rotate', 'duplicate']) root.querySelector('[data-command="' + command + '"]').disabled = !selection()?.type;
    root.querySelector('[data-command="delete"]').disabled = !selection();
  }
  function propertyField(container, name, type, value, update, attributes = {}) {
    const label = document.createElement('label');
    label.textContent = name;
    const input = document.createElement('input');
    input.type = type;
    input.value = value;
    for (const [key, content] of Object.entries(attributes)) input.setAttribute(key, content);
    input.addEventListener('change', () => edit(() => update(input.value)));
    label.append(input);
    container.append(label);
  }
  function showProperties() {
    const container = $('build-properties');
    container.replaceChildren();
    const item = selection();
    if (!item) {
      const note = document.createElement('p');
      note.className = 'build-inspector-empty';
      note.textContent = 'Select a component or wire to change its properties.';
      container.append(note);
      return;
    }
    const heading = document.createElement('h3');
    heading.textContent = item.type ? PARTS[item.type].name : view === 'pcb' ? 'Copper trace' : 'Wire';
    container.append(heading);
    if (item.type) {
      propertyField(container, 'Label', 'text', item.label, value => { item.label = value; }, { maxlength: '80' });
      if (item.type === 'resistor') propertyField(container, 'Resistance (Ω)', 'number', item.resistance, value => {
        const number = Number(value);
        if (Number.isFinite(number) && number >= 1 && number <= 9900000) item.resistance = number;
        else message('Resistance must be between 1 and 9,900,000 Ω.');
      }, { min: '1', max: '9900000' });
      if (item.type === 'led') propertyField(container, 'LED color', 'color', item.color, value => { item.color = value; });
      const note = document.createElement('p');
      note.textContent = terminals(item).length + ' terminals · ' + item.placements[view].rotation + '°';
      container.append(note);
    } else {
      propertyField(container, 'Color', 'color', item.color, value => { item.color = value; });
      const note = document.createElement('p');
      note.textContent = 'Double-click the wire to add a bend. Drag its handles to adjust the route.';
      container.append(note);
      if (view === 'pcb') {
        const button = document.createElement('button');
        button.className = 'build-route-button';
        button.textContent = item.routed?.pcb ? 'Mark as unrouted' : 'Route this trace';
        button.onclick = () => edit(() => { item.routed = { pcb: !item.routed?.pcb }; });
        container.append(button);
      }
    }
  }
  function render() {
    $('build-name').value = documentData.name;
    $('build-board-width').value = (documentData.board.width / GRID * 2.54).toFixed(2);
    $('build-board-height').value = (documentData.board.height / GRID * 2.54).toFixed(2);
    showProperties();
    drawScene();
  }
  function populateLibrary() {
    const query = $('build-search').value.trim().toLowerCase();
    $('build-library-list').innerHTML = Object.entries(PARTS).filter(([, part]) => (part.name + ' ' + part.category).toLowerCase().includes(query)).map(([type, part]) => {
      const preview = newPart(type, { x: 0, y: 0 }, []);
      const content = drawing(preview, 'breadboard') + terminalDrawing(preview, 'breadboard');
      return '<button class="build-part-card" data-add="' + type + '" draggable="true"><svg viewBox="-14 -18 ' + (part.width + 28) + ' ' + (part.height + 40) + '" aria-hidden="true">' + content + '</svg><span><strong>' + part.name + '</strong><small>' + part.category + '</small></span><span class="build-part-add">+</span></button>';
    }).join('');
  }
  async function confirmReplace() {
    return !dirty() || confirm('This circuit has unsaved changes. Continue without saving it to a file?');
  }
  async function save() {
    if (ioBusy || !ready) return;
    ioBusy = true;
    updateFileState();
    const content = snapshot();
    try {
      const path = await call('buildSave', { content, path: filePath, name: documentData.name });
      if (path) { filePath = path; saveSnapshot = content; savedToFile = true; queueDraft(); message('Circuit saved.'); }
    } finally { ioBusy = false; updateFileState(); }
  }
  async function exportImage() {
    const bounds = documentData.parts.filter(part => view === 'breadboard' || part.type !== 'breadboard').map(part => {
      const placement = part.placements[view], dimensions = size(part, view);
      return { x: placement.x - dimensions.height, y: placement.y - dimensions.width, right: placement.x + dimensions.width + dimensions.height, bottom: placement.y + dimensions.height + dimensions.width };
    });
    bounds.push({ x: 0, y: 0, right: documentData.board.width, bottom: documentData.board.height });
    for (const connection of documentData.connections) for (const point of connection.routes[view]) bounds.push({ ...point, right: point.x, bottom: point.y });
    const x = Math.min(...bounds.map(bound => bound.x)) - 24, y = Math.min(...bounds.map(bound => bound.y)) - 24;
    const width = Math.max(...bounds.map(bound => bound.right)) - x + 24, height = Math.max(...bounds.map(bound => bound.bottom)) - y + 24;
    const content = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="' + [x, y, width, height].join(' ') + '" width="' + width + '" height="' + height + '">' +
      svg('rect', { x, y, width, height, fill: view === 'pcb' ? '#101c19' : '#16202b' }) + renderDrawing(true) + '</svg>';
    if (await call('buildExport', { content, name: documentData.name + '-' + view })) message('SVG image exported.');
  }
  function history(redo) {
    const source = redo ? redoStack : undoStack;
    const target = redo ? undoStack : redoStack;
    if (!source.length) return;
    target.push(clone(documentData));
    documentData = source.pop();
    selected = null;
    pendingWire = null;
    changed();
  }
  async function command(name) {
    if (name === 'save') return save();
    if (name === 'export') return exportImage();
    if (name === 'settings') return document.getElementById('settings-view').click();
    if (name === 'toggle-library') { root.classList.toggle('build-library-collapsed'); return; }
    if (name === 'zoom-in') return zoom(1.2);
    if (name === 'zoom-out') return zoom(1 / 1.2);
    if (name === 'fit') return fit();
    if (!ready || ioBusy) return;
    if (name === 'undo') return history(false);
    if (name === 'redo') return history(true);
    if (name === 'new' && await confirmReplace()) {
      record(clone(documentData));
      documentData = emptyDocument(); filePath = null; savedToFile = false; saveSnapshot = snapshot(); selected = null; pendingWire = null;
      changed(); fit(); return;
    }
    if (name === 'open' && await confirmReplace()) {
      ioBusy = true;
      try {
        const result = await call('buildOpen');
        if (!result) return;
        const loaded = validate(JSON.parse(result.content));
        record(clone(documentData));
        documentData = loaded; filePath = result.path; savedToFile = true; saveSnapshot = snapshot(); selected = null; pendingWire = null;
        changed(); fit(); message('Circuit opened.');
      } finally { ioBusy = false; updateFileState(); }
      return;
    }
    if (name === 'example' && await confirmReplace()) {
      edit(() => {
        documentData = emptyDocument(); documentData.name = 'Arduino LED circuit';
        const board = newPart('uno', { x: 48, y: 72 }, []);
        const resistor = newPart('resistor', { x: 360, y: 96 }, []);
        const led = newPart('led', { x: 528, y: 96 }, []);
        documentData.parts = [board, resistor, led];
        const wire = (from, fromPin, to, toPin, color) => ({ id: crypto.randomUUID(), from: { part: from.id, pin: fromPin }, to: { part: to.id, pin: toPin }, color, routes: { breadboard: [], schematic: [], pcb: [] } });
        documentData.connections = [wire(board, 'D13', resistor, '1', '#ee7069'), wire(resistor, '2', led, 'A', '#ee7069'), wire(led, 'K', board, 'GND', '#719fed')];
        filePath = null; savedToFile = false; selected = null;
      });
      fit(); return;
    }
    const item = selection();
    if (name === 'copy' && item?.type) { clipboard = clone(item); message('Component copied. Press ⌘V to paste.'); return; }
    if (name === 'paste' && clipboard || name === 'duplicate' && item?.type) {
      if (documentData.parts.length >= 300) return message('The component limit is 300.');
      edit(() => {
        const source = name === 'paste' ? clipboard : item;
        const part = newPart(source.type, source.placements[view], documentData.parts);
        part.color = source.color; part.resistance = source.resistance;
        for (const mode of VIEWS) part.placements[mode] = { ...source.placements[mode], x: source.placements[mode].x + 24, y: source.placements[mode].y + 24 };
        documentData.parts.push(part); selected = part.id;
      });
    }
    if (name === 'rotate' && item?.type) edit(() => { item.placements[view].rotation = (item.placements[view].rotation + 90) % 360; });
    if (name === 'delete' && item) edit(() => {
      documentData.parts = documentData.parts.filter(part => part.id !== selected);
      documentData.connections = documentData.connections.filter(connection => connection.id !== selected && connection.from.part !== selected && connection.to.part !== selected);
      selected = null; pendingWire = null;
    });
  }
  root.addEventListener('click', event => {
    const button = event.target.closest('button');
    if (!button) return;
    if (button.dataset.add) return add(button.dataset.add, { x: camera.x + 96 / camera.scale, y: camera.y + 96 / camera.scale });
    if (button.dataset.view) return setView(button.dataset.view);
    if (button.dataset.tool) {
      tool = button.dataset.tool; pendingWire = null;
      for (const control of root.querySelectorAll('[data-tool]')) control.setAttribute('aria-pressed', String(control === button));
      drawScene(); return;
    }
    if (button.dataset.command) void command(button.dataset.command).catch(error => message(error.message));
  });
  root.addEventListener('dragstart', event => {
    const button = event.target.closest('[data-add]');
    if (!button) return;
    event.dataTransfer.setData('application/x-pinway-component', button.dataset.add);
    event.dataTransfer.effectAllowed = 'copy';
  });
  canvas.addEventListener('dragover', event => {
    if ([...event.dataTransfer.types].includes('application/x-pinway-component')) event.preventDefault();
  });
  canvas.addEventListener('drop', event => {
    event.preventDefault();
    const type = event.dataTransfer.getData('application/x-pinway-component');
    if (Object.hasOwn(PARTS, type)) add(type, world(event));
  });
  $('build-search').addEventListener('input', populateLibrary);
  $('build-name').addEventListener('change', () => edit(() => { documentData.name = $('build-name').value.trim() || 'Untitled circuit'; }));
  for (const axis of ['width', 'height']) $('build-board-' + axis).addEventListener('change', event => {
    const value = Number(event.target.value);
    if (Number.isFinite(value) && value >= 25.4 && value <= 508) edit(() => { documentData.board[axis] = snap(value / 2.54 * GRID); });
    else { message('Board dimensions must be between 25.4 and 508 mm.'); render(); }
  });
  function connectTerminal(ref) {
    if (!pendingWire) return;
    if (pendingWire.from.part === ref.part && pendingWire.from.pin === ref.pin) {
      pendingWire = null; drawScene(); return;
    }
    if (documentData.connections.length >= 2000) return message('The connection limit is 2,000.');
    edit(() => {
      documentData.connections.push({
        id: crypto.randomUUID(), from: pendingWire.from, to: ref, color: $('build-wire-color').value, routed: { pcb: view === 'pcb' },
        routes: Object.fromEntries(VIEWS.map(mode => [mode, mode === view ? pendingWire.bends : []])),
      });
    });
    pendingWire = null;
    drawScene();
    message('Connected.');
  }
  canvas.addEventListener('pointerdown', event => {
    if (!ready || ioBusy || ![0, 1].includes(event.button)) return;
    if (event.target.closest('button')) return;
    canvas.focus();
    const point = world(event);
    const terminal = event.target.closest('[data-terminal-part]');
    const bend = event.target.closest('[data-bend-index]');
    const connection = event.target.closest('[data-connection-id]');
    const partElement = event.target.closest('[data-part-id]');
    if (spaceHeld || event.button === 1) {
      event.preventDefault();
      gesture = { type: 'pan', x: event.clientX, y: event.clientY, camera: { ...camera } };
    } else if (terminal) {
      const ref = { part: terminal.dataset.terminalPart, pin: terminal.dataset.terminalPin };
      if (pendingWire) { connectTerminal(ref); return; }
      pendingWire = { from: ref, bends: [], cursor: point, start: { x: event.clientX, y: event.clientY } };
      drawScene(); message('Click the next terminal. Click the canvas to add a bend; Escape cancels.'); return;
    } else if (pendingWire) {
      if (pendingWire.bends.length < 100) pendingWire.bends.push({ x: Math.max(-19000, Math.min(19000, snap(point.x))), y: Math.max(-19000, Math.min(19000, snap(point.y))) });
      drawScene(); return;
    } else if (bend) {
      selected = bend.dataset.connectionId;
      gesture = { type: 'bend', index: Number(bend.dataset.bendIndex), before: clone(documentData) };
    } else if (connection) {
      selected = connection.dataset.connectionId; render(); return;
    } else if (partElement && tool === 'select') {
      selected = partElement.dataset.partId;
      gesture = { type: 'part', start: point, placement: { ...selection().placements[view] }, before: clone(documentData) };
      showProperties(); drawScene();
    } else { selected = null; render(); }
    if (gesture) canvas.setPointerCapture(event.pointerId);
  });
  canvas.addEventListener('pointermove', event => {
    const point = world(event);
    if (gesture?.type === 'pan') {
      camera.x = gesture.camera.x - (event.clientX - gesture.x) / camera.scale;
      camera.y = gesture.camera.y - (event.clientY - gesture.y) / camera.scale;
      drawScene(); return;
    }
    if (gesture?.type === 'part') {
      const placement = selection().placements[view];
      placement.x = Math.max(-19000, Math.min(19000, snap(gesture.placement.x + point.x - gesture.start.x)));
      placement.y = Math.max(-19000, Math.min(19000, snap(gesture.placement.y + point.y - gesture.start.y)));
      netCache = null; drawScene(); return;
    }
    if (gesture?.type === 'bend') {
      if (view === 'pcb') selection().routed = { pcb: true };
      selection().routes[view][gesture.index] = { x: Math.max(-19000, Math.min(19000, snap(point.x))), y: Math.max(-19000, Math.min(19000, snap(point.y))) };
      drawScene(); return;
    }
    if (pendingWire) { pendingWire.cursor = point; drawScene(); return; }
    const terminal = event.target.closest('[data-terminal-part]');
    const next = terminal ? { part: terminal.dataset.terminalPart, pin: terminal.dataset.terminalPin } : null;
    if (JSON.stringify(next) !== JSON.stringify(hovering)) {
      hovering = next;
      drawScene();
      if (next) {
        const net = nets().find(group => group.some(contact => contact.part === next.part && contact.pin === next.pin));
        message((net?.length || 1) + ' electrically connected terminals');
      }
    }
  });
  function finishGesture(event, cancelled = false) {
    if (!gesture) return;
    if (gesture.before) {
      if (cancelled) documentData = gesture.before;
      else if (JSON.stringify(gesture.before) !== snapshot()) record(gesture.before);
      changed();
    }
    gesture = null;
    if (canvas.hasPointerCapture(event.pointerId)) canvas.releasePointerCapture(event.pointerId);
  }
  canvas.addEventListener('pointerup', event => {
    if (pendingWire?.start && Math.hypot(event.clientX - pendingWire.start.x, event.clientY - pendingWire.start.y) > 8) {
      const target = document.elementFromPoint(event.clientX, event.clientY)?.closest('[data-terminal-part]');
      if (target) connectTerminal({ part: target.dataset.terminalPart, pin: target.dataset.terminalPin });
    }
    finishGesture(event);
  });
  canvas.addEventListener('pointercancel', event => finishGesture(event, true));
  canvas.addEventListener('dblclick', event => {
    const target = event.target.closest('[data-connection-id]');
    if (!target || event.target.closest('[data-bend-index]')) return;
    const connection = documentData.connections.find(item => item.id === target.dataset.connectionId);
    if (!connection || connection.routes[view].length >= 100) return;
    const point = world(event);
    selected = connection.id;
    edit(() => { if (view === 'pcb') connection.routed = { pcb: true }; connection.routes[view].push({ x: Math.max(-19000, Math.min(19000, snap(point.x))), y: Math.max(-19000, Math.min(19000, snap(point.y))) }); });
  });
  canvas.addEventListener('wheel', event => {
    event.preventDefault();
    if (event.ctrlKey || event.metaKey) {
      const bounds = canvas.getBoundingClientRect();
      zoom(Math.exp(-event.deltaY * 0.008), { x: event.clientX - bounds.left, y: event.clientY - bounds.top });
    } else {
      camera.x += event.deltaX / camera.scale; camera.y += event.deltaY / camera.scale; drawScene();
    }
  }, { passive: false });
  document.addEventListener('keydown', event => {
    if (!enabled || document.querySelector('dialog[open]') || event.target.closest('input,textarea,select')) return;
    const modifier = event.metaKey || event.ctrlKey;
    if (event.code === 'Space') { spaceHeld = true; event.preventDefault(); }
    if (event.key === 'Escape') { pendingWire = null; selected = null; render(); }
    const action = modifier ? { s: 'save', o: 'open', n: 'new', z: event.shiftKey ? 'redo' : 'undo', y: 'redo', c: 'copy', v: 'paste', d: 'duplicate' }[event.key.toLowerCase()] : { r: 'rotate', Delete: 'delete', Backspace: 'delete' }[event.key] || (event.key.toLowerCase() === 'r' ? 'rotate' : null);
    if (action) { event.preventDefault(); event.stopImmediatePropagation(); void command(action).catch(error => message(error.message)); }
  }, true);
  document.addEventListener('keyup', event => { if (event.code === 'Space') spaceHeld = false; });
  window.addEventListener('blur', () => { spaceHeld = false; });
  new ResizeObserver(() => { if (enabled) drawScene(); }).observe(canvas);
  populateLibrary();
  render();
  void call('buildRestore').then(result => {
    if (result?.content) {
      documentData = validate(JSON.parse(result.content));
      filePath = result.path || null;
      saveSnapshot = snapshot();
      savedToFile = false;
      message('Previous circuit draft restored.');
    }
  }).catch(error => { restoringError = error.message; }).finally(() => {
    ready = true; netCache = null; render(); updateFileState();
    if (restoringError) message('Draft could not be restored: ' + restoringError);
  });
  return {
    get active() { return enabled; },
    setActive(value) { enabled = value; root.hidden = !value; activateCode(!value); if (value) { render(); canvas.focus(); } },
    async shortcut(action) {
      if (['new', 'open', 'save'].includes(action)) { await command(action); return true; }
      if ((action === 'quit' || action === 'window') && ready) {
        clearTimeout(draftTimer);
        await draftQueue.catch(() => {});
        await call('buildDraft', { content: snapshot(), path: filePath });
      }
      return false;
    },
  };
}
