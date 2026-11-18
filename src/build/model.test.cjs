const {test} = require('node:test');
const assert = require('node:assert/strict');
const {emptyDocument, newPart, terminals, pinPosition, electricalNets, resistorColors, validate} = require('../../.toolchain/build-model.cjs');

function part(type, x=0, y=0) { return newPart(type, {x,y}, []); }
function net(document, component, pin) {
  return electricalNets(document).find(group => group.some(point => point.part === component.id && point.pin === pin));
}
test('five-hole strips, center gap, columns and power rails are separate', () => {
  const document=emptyDocument(), board=part('breadboard');
  document.parts=[board];
  const members=net(document,board,'h0-0');
  assert.equal(members.length,5);
  assert(members.some(point=>point.pin==='h4-0'));
  assert(!members.some(point=>point.pin==='h5-0'||point.pin==='h0-1'));
  assert.equal(net(document,board,'rail0-0').length,30);
});
test('inserting a terminal into a hole joins its intrinsic net; moving it disconnects it', () => {
  const document=emptyDocument(), board=part('breadboard'), led=part('led',24,-12);
  document.parts=[board,led];
  assert.equal(net(document,led,'A').length,6);
  assert(net(document,led,'A').some(point=>point.pin==='h0-0'));
  led.placements.breadboard.y+=6;
  assert.equal(net(document,led,'A').length,1);
});
test('wire endpoints remain the same after moving, rotating and changing views', () => {
  const document=emptyDocument(), resistor=part('resistor',120,60), led=part('led',300,120);
  document.parts=[resistor,led];
  document.connections=[{id:'wire1',from:{part:resistor.id,pin:'2'},to:{part:led.id,pin:'A'},color:'#ff0000',routes:{breadboard:[{x:252,y:120}],schematic:[],pcb:[]}}];
  const refs=structuredClone(document.connections);
  resistor.placements.pcb.x=480;
  led.placements.schematic.rotation=90;
  assert.equal(net(document,led,'A').length,2);
  assert.deepEqual(document.connections,refs);
  assert.deepEqual(validate(JSON.parse(JSON.stringify(document))),document);
  assert.notDeepEqual(pinPosition(led,terminals(led,'schematic')[0],'schematic'),pinPosition(led,terminals(led)[0],'breadboard'));
});
test('push-button contact pairs remain connected without bridging the switch', () => {
  const document=emptyDocument(), button=part('button');
  document.parts=[button];
  assert.deepEqual(net(document,button,'1').map(point=>point.pin).sort(),['1','3']);
  assert.deepEqual(net(document,button,'2').map(point=>point.pin).sort(),['2','4']);
});
test('malformed topology and unsafe color payloads are rejected', () => {
  const document=emptyDocument(), led=part('led');
  document.parts=[led];
  for (const change of [
    value=>value.parts.push(value.parts[0]),
    value=>value.parts[0].color='url(example)',
    value=>value.parts[0].placements.pcb.x=Infinity,
    value=>value.board.width=0,
    value=>value.connections.push({id:'bad',from:{part:led.id,pin:'unknown'},to:{part:led.id,pin:'K'},color:'#ff0000',routes:{breadboard:[],schematic:[],pcb:[]}}),
  ]) {
    const changed=structuredClone(document);
    change(changed);
    assert.throws(()=>validate(changed));
  }
});
test('resistor bands encode standard values and handle decade rounding', () => {
  assert.deepEqual(resistorColors(1000),['#875234','#171a20','#de4e4e','#c9aa5d']);
  assert.deepEqual(resistorColors(220),['#de4e4e','#de4e4e','#875234','#c9aa5d']);
  assert.equal(resistorColors(999).every(Boolean),true);
});
