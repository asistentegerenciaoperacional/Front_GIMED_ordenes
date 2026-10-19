import {access,mkdir,mkdtemp,cp,writeFile} from 'node:fs/promises';
import {resolve,join} from 'node:path';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
const exec=promisify(execFile);
const commit=process.env.ARIA_BASELINE_COMMIT??'bd37e32c943477dd36c6936c8453160c0abf34b9';
const destination=resolve(process.env.ARIA_BASELINE_ROOT??'tests/.tmp/aria-baseline');
try{await access(join(destination,'dist/index.html'));console.log('Referencia existente conservada: '+destination);process.exit(0);}catch{}
await mkdir('tests/.tmp',{recursive:true});
const temporary=await mkdtemp(resolve('tests/.tmp/aria-rebuild-'));
const source=join(temporary,'source');
await mkdir(source);
await exec('git',['archive','--format=zip','--output='+join(temporary,'source.zip'),commit],{windowsHide:true});
await exec('powershell.exe',['-NoProfile','-Command','Expand-Archive -LiteralPath $env:ARIA_SOURCE_ZIP -DestinationPath $env:ARIA_SOURCE_DIR'],{
 windowsHide:true,env:{...process.env,ARIA_SOURCE_ZIP:join(temporary,'source.zip'),ARIA_SOURCE_DIR:source}});
for(const args of [['ci'],['run','build']]){
 const result=await exec(process.env.ComSpec??'cmd.exe',['/d','/s','/c','npm.cmd '+args.join(' ')],{cwd:source,windowsHide:true,maxBuffer:10*1024*1024});
 process.stdout.write(result.stdout);
}
await mkdir(destination,{recursive:true});
await cp(join(source,'dist'),join(destination,'dist'),{recursive:true});
await writeFile(join(destination,'baseline.json'),JSON.stringify({commit},null,2)+'\n');
console.log('Compilación aislada de referencia: '+destination);
