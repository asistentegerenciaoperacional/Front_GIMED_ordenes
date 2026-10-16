import {firefox} from 'playwright-core';
import {readFile,writeFile,mkdir,cp} from 'node:fs/promises';
import {dirname,resolve,join} from 'node:path';
import assert from 'node:assert/strict';
// Workaround for Windows SideBySide resolving mozglue in the packaged test browser.
// Extract the embedded manifest into a workspace copy; never modify installed binaries.
assert.equal(process.platform,'win32');
const source=dirname(firefox.executablePath());
const destination=resolve('tests/.tmp/firefox-runtime');
await mkdir(destination,{recursive:true});
await cp(source,destination,{recursive:true});
const dll=await readFile(join(destination,'mozglue.dll'));
const start=dll.indexOf(Buffer.from('<assembly'));
const end=dll.indexOf(Buffer.from('</assembly>'),start);
assert.ok(start>=0&&end>start,'mozglue.dll contiene el manifiesto XML');
await writeFile(join(destination,'mozglue.manifest'),dll.subarray(start,end+'</assembly>'.length));
console.log(join(destination,'firefox.exe'));
