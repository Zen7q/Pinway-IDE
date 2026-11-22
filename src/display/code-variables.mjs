// Conservative discovery of file-scope scalar definitions in an Arduino sketch.
// Comments, strings, function bodies, arrays, pointers and conditional branches
// are not treated as writable global variables.
export function scanCodeVariables(source) {
  const clean=source.replace(/R"([^ ()\\\t\r\n]{0,16})\([\s\S]*?\)\1"|"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|\/\/[^\n]*|\/\*[\s\S]*?\*\//g,m=>m.replace(/[^\n]/g,' '));
  const found=[],warnings=[];let depth=0,start=0,conditional=0;
  const lines=clean.split('\n');
  const text=lines.map(line=>{
    if(/^\s*#\s*(if|ifdef|ifndef)\b/.test(line))conditional++;
    const skip=conditional>0||/^\s*#/.test(line);
    if(/^\s*#\s*endif\b/.test(line))conditional--;
    return skip?' '.repeat(line.length):line;
  }).join('\n');
  for(let i=0;i<text.length;i++) {
    const ch=text[i];
    if(ch==='{'){depth++;continue;}
    if(ch==='}'){depth--;if(depth===0)start=i+1;continue;}
    if(ch!==';'||depth!==0)continue;
    const statement=text.slice(start,i).trim();start=i+1;
    const m=statement.match(/^(?:(const|constexpr)\s+)?(?:(volatile)\s+)?(bool|byte|int|unsigned int|unsigned|long|unsigned long|short|unsigned short|float|double|u?int(?:8|16|32)_t)\s+([A-Za-z_]\w*)\s*(?:=\s*([+-]?(?:0[xX][\da-fA-F]+|\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?[uUlLfF]*|true|false))?$/);
    if(!m)continue;
    const [,constant,,cppType,name,literal]=m;
    const type=cppType==='bool'?'boolean':'number';
    const value=type==='boolean'?literal==='true'||Number(literal)===1:literal?Number(literal.replace(/^([+-]?0[xX][\da-fA-F]+)[uUlL]*$/,'$1').replace(/(\d)[uUlL]+$/,'$1').replace(/(\d)[fF]$/,'$1')):0;
    if(!Number.isFinite(value)&&type==='number')continue;
    if(found.some(v=>v.name===name)){warnings.push(`Неоднозначна змінна ${name}`);continue;}
    found.push({name,type,value,source:'code',cppType,readonly:!!constant,line:source.slice(0,i).split('\n').length});
  }
  return {variables:found,warnings};
}
