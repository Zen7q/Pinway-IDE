import { build } from 'esbuild';
import { mkdir, copyFile, readFile } from 'node:fs/promises';
for (const [id, source, css] of [['build', 'designer', 'designer.css'], ['display', 'display', 'display.css']]) {
  const directory = `.toolchain/addons/${id}`;
  await mkdir(directory, { recursive: true });
  await build({ entryPoints: [`src/${source}/workspace.js`], bundle: true, format: 'esm',
    minify: true, target: 'safari15', outfile: `${directory}/workspace.js` });
  await copyFile(`src/${css}`, `${directory}/workspace.css`);
}
console.log('Built separate Build and Display modules.');
