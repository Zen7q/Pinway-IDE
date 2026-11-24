import test from 'node:test';
import assert from 'node:assert/strict';
import {wireRoute,elbowRoute,partBounds,terminalExit} from '../src/designer/routing.mjs';
function orthogonal(points){for(let i=1;i<points.length;i++)assert.ok(points[i-1].x===points[i].x||points[i-1].y===points[i].y);}
test('diagonal endpoints become elbows; aligned endpoints stay straight',()=>{
 const a={x:0,y:0},b={x:100,y:70},route=wireRoute(a,b);orthogonal(route);assert.deepEqual(route[0],a);assert.deepEqual(route.at(-1),b);assert.ok(route.length>2);
 assert.deepEqual(wireRoute(a,{x:100,y:0}),[a,{x:100,y:0}]);
});
test('automatic corridor avoids a component between aligned endpoints',()=>{
 const route=elbowRoute({x:0,y:0},{x:100,y:0},[{left:30,right:70,top:-20,bottom:20}]);orthogonal(route);assert.ok(route.some(p=>Math.abs(p.y)>=32));
});
test('manual anchors survive, without mutating saved bends, and move endpoints reroutes',()=>{
 const bends=[{x:50,y:80}],copy=structuredClone(bends);
 const route=wireRoute({x:0,y:0},{x:100,y:20},{bends});orthogonal(route);assert.ok(route.some(p=>p.x===50&&p.y===80));assert.deepEqual(bends,copy);
 const moved=wireRoute({x:20,y:30},{x:100,y:20},{bends});orthogonal(moved);assert.deepEqual(moved[0],{x:20,y:30});assert.notDeepEqual(moved,route);
});
test('rotated component bounds and exits keep wires outside the body',()=>{
 const shape={width:80,height:20},pose={x:100,y:50,angle:90},bounds=partBounds(shape,pose);
 assert.ok(Math.abs(bounds.left-130)<1e-6);assert.ok(Math.abs(bounds.bottom-100)<1e-6);
 const a={x:140,y:20},start=terminalExit(a,bounds);assert.deepEqual(start,{x:140,y:8});
 orthogonal(wireRoute(a,{x:250,y:150},{start,obstacles:[bounds]}));
});
test('coincident contacts produce a finite route',()=>{assert.deepEqual(wireRoute({x:1,y:2},{x:1,y:2}),[{x:1,y:2}]);});
