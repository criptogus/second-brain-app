// Run with the installed Electron executable and ELECTRON_RUN_AS_NODE=1.
const fs = require('node:fs'), path = require('node:path'), crypto = require('node:crypto');
const { spawn } = require('node:child_process');
const assert = require('node:assert/strict');
const arg = n => { const i = process.argv.indexOf(n); assert(i >= 0 && process.argv[i+1], `Missing ${n}`); return path.resolve(process.argv[i+1]); };
const resources = arg('--resources'), exe = arg('--exe'), out = arg('--out');
fs.mkdirSync(out, {recursive:true});
const checks = [], secrets = [crypto.randomBytes(32).toString('hex'), crypto.randomBytes(32).toString('hex')];
const [pass, wrong] = secrets, marker = 'smokemarker' + crypto.randomBytes(12).toString('hex');
const clean = s => secrets.reduce((v,k) => v.split(k).join('[REDACTED]'), String(s));
async function check(name, fn) { try { checks.push({name,ok:true,detail:clean(await fn() || 'passed')}); } catch(e) { checks.push({name,ok:false,detail:clean(e.stack || e)}); } }
function files(dir) { return fs.readdirSync(dir,{withFileTypes:true}).flatMap(e => e.isDirectory()?files(path.join(dir,e.name)):e.isFile()?[path.join(dir,e.name)]:[]); }
let childId=0;
function child(script,args=[],input='',env={},fd=false) {
  return new Promise((resolve,reject) => {
    const base=path.join(out,`child-${++childId}`), stdoutFile=base+'-stdout.log',stderrFile=base+'-stderr.log';
    const output=fs.openSync(stdoutFile,'w'),error=fs.openSync(stderrFile,'w');
    // JSON-RPC contains no credentials. A finite stdio transcript also guarantees EOF.
    let rpcFd;
    if(fd){fs.writeFileSync(base+'-rpc.jsonl',rpcInput);rpcFd=fs.openSync(base+'-rpc.jsonl','r');}
    const p=spawn(exe,[script,...args],{env:{...process.env,ELECTRON_RUN_AS_NODE:'1',...env},stdio:fd?[rpcFd,output,error,'pipe']:['pipe',output,error]});
    fs.closeSync(output);fs.closeSync(error);if(fd)fs.closeSync(rpcFd);
    let timed=false,finished=false;
    function finish(code,err){
      if(finished)return;finished=true;clearTimeout(timer);clearTimeout(hardTimer);
      const stdout=fs.readFileSync(stdoutFile,'utf8'),stderr=fs.readFileSync(stderrFile,'utf8');
      fs.writeFileSync(stdoutFile,clean(stdout));fs.writeFileSync(stderrFile,clean(stderr));
      if(err)reject(err);else resolve({code,stdout,stderr,timed});
    }
    const timer=setTimeout(()=>{timed=true;p.kill('SIGKILL');},60000);
    const hardTimer=setTimeout(()=>{p.stdin?.destroy();p.stdio[3]?.destroy();finish(null);},65000);
    p.on('error',e=>finish(null,e));p.on('close',code=>finish(code));
    const credential=fd?p.stdio[3]:p.stdin;credential.on('error',()=>{});credential.end(input+(fd?'\n':''),()=>{if(fd)credential.destroy();});
  });
}
const rpcInput=[{id:1,method:'initialize',params:{protocolVersion:'2024-11-05',capabilities:{},clientInfo:{name:'smoke',version:'1'}}},{method:'notifications/initialized'},{id:2,method:'tools/list'},{id:3,method:'tools/call',params:{name:'read_note',arguments:{path:'notes/smoke.md'}}}].map(x=>JSON.stringify({jsonrpc:'2.0',...x})).join('\n')+'\n';
(async()=>{
const asar=path.join(resources,'app.asar');let api,keys;
await check('A native SQLCipher and runtime',()=>{
 const Database=require(path.join(asar,'node_modules/better-sqlite3-multiple-ciphers'));
 const file=path.join(out,'native.sqlite'); const open=k=>{const d=new Database(file);d.pragma("cipher='sqlcipher'");d.pragma(`key='${k}'`);return d;};
 let d=open(pass);try{d.exec('CREATE TABLE smoke(value TEXT)');d.prepare('INSERT INTO smoke VALUES (?)').run(marker);}finally{d.close();}
 const bytes=fs.readFileSync(file);assert(!bytes.includes(marker));assert(!bytes.subarray(0,16).toString().startsWith('SQLite format 3'));
 d=open(pass);try{assert.equal(d.prepare('SELECT value FROM smoke').get().value,marker);}finally{d.close();}
 d=open(wrong);try{assert.throws(()=>d.prepare('SELECT value FROM smoke').get());}finally{d.close();}
 return JSON.stringify({electron:process.versions.electron,modules:process.versions.modules,node:process.versions.node,platform:process.platform,arch:process.arch});
});
await check('B packaged app and sync crypto',async()=>{
 api=require(path.join(asar,'out/main/mcp-keys.js'));
 const setup=await api.SpaceKeys.setup(pass,new api.InMemorySecretStore());keys=setup.keys;secrets.push(setup.recoveryKey);keys.createSpace('personal');
 const box=keys.encrypt(marker,'personal','smoke');assert(!box.includes(marker));assert(box.startsWith('KEEPMIND-SEALED:1\n'));
 await assert.rejects(()=>api.SpaceKeys.unlock(keys.config,new api.InMemorySecretStore(),{passphrase:wrong}));
 for(const credential of [{passphrase:pass},{recoveryKey:setup.recoveryKey}]){const k=await api.SpaceKeys.unlock(keys.config,new api.InMemorySecretStore(),credential);assert.equal(k.decrypt(box,'personal','smoke'),marker);k.lock();}
 const h=await api.createCryptoHeader(), k=await api.deriveKey(pass,h), bad=await api.deriveKey(wrong,h);
 const cipher=await api.encryptMemory(marker,k);assert(api.isEncrypted(cipher));assert(!cipher.includes(marker));assert.equal(await api.decryptMemory(cipher,k),marker);await assert.rejects(()=>api.decryptMemory(cipher,bad));k.fill(0);bad.fill(0);
});
const mem=path.join(out,'memory'),state=path.join(out,'state'),cli=path.join(asar,'tools/keepmind-cli.mjs');
await check('C encrypted Memory and CLI search',async()=>{
 assert(keys,'crypto setup failed');
 const chunks=path.join(asar,'out/main/chunks');const {Memory}=require(path.join(chunks,fs.readdirSync(chunks).find(n=>/^scheduler-.*\.js$/.test(n))));
 const memory=new Memory(mem,null);memory.keys=keys;memory.encryptAll=true;
 memory.write('notes/smoke.md',`# Smoke\n\n${marker}\n`);memory.write('notes/second.md','# Secondary\n\nA harmless second note.\n');
 fs.mkdirSync(path.join(state,'security'),{recursive:true});fs.writeFileSync(path.join(state,'security/memory-keys.json'),JSON.stringify({...keys.config,encryptAll:true}),{mode:0o600});
 for(const args of [['index',mem,'--state',state,'--unlock-stdin'],['search',marker,'--dir',mem,'--state',state,'--unlock-stdin']]){
 const r=await child(cli,args,pass+'\n');assert(!r.timed,'CLI timeout');assert.equal(r.code,0,clean(r.stderr));if(args[0]==='search')assert(r.stdout.includes(marker),'search did not find note');
 }
 const bad=await child(cli,['search',marker,'--dir',mem,'--state',state,'--unlock-stdin'],wrong+'\n');assert(!bad.timed);assert.notEqual(bad.code,0);assert.equal(bad.stdout.trim(),'');
 const locked=await child(cli,['search',marker,'--dir',mem,'--state',state]);assert(!locked.timed);assert.notEqual(locked.code,0);assert.equal(locked.stdout.trim(),'');
 await assert.rejects(()=>require(path.join(asar,'out/main/cli.js')).runCli(['search',marker,'--dir',mem,'--state',state]),/Index locked/);
});
await check('D MCP fd 3 unlock and wrong-passphrase denial',async()=>{
 const scopes=path.join(out,'scopes.json');fs.writeFileSync(scopes,JSON.stringify({smoke:{spaces:['personal'],defaultSpace:'personal',maxClass:'secret',write:false}}));
 const env={KEEPMIND_MCP_STATE:state,KEEPMIND_MCP_UNLOCK_FD:'3',KEEPMIND_MCP_SCOPES:scopes,KEEPMIND_MCP_CLIENT:'smoke'};
 const script=path.join(asar,'tools/keepmind-mcp.mjs'),r=await child(script,['--memory-dir',mem],pass,env,true);
 assert(!r.timed,'MCP timeout');assert.equal(r.code,0,r.stderr);
 const replies=r.stdout.trim().split('\n').map(x=>JSON.parse(x));assert(replies.find(x=>x.id===1)?.result?.serverInfo);assert(replies.find(x=>x.id===2)?.result?.tools?.length);const call=replies.find(x=>x.id===3);assert(!call?.result?.isError);assert(JSON.stringify(call?.result).includes(marker),'MCP did not return note');
 const bad=await child(script,['--memory-dir',mem],wrong,env,true);assert(!bad.timed);assert.notEqual(bad.code,0);assert(!bad.stdout.includes(marker));return 'initialize, tools/list, read_note; wrong credential denied';
});
await check('C persisted vault/index plaintext scan',()=>{
 assert(fs.existsSync(path.join(state,'memory-search.sqlite')),'index missing');
 for(const f of [...files(mem),...files(state)]){const b=fs.readFileSync(f);assert(!b.includes(marker),`plaintext marker in ${f}`);if(f.includes('memory-search.sqlite'))assert(!b.subarray(0,16).toString().startsWith('SQLite format 3'),`plaintext SQLite: ${f}`);}
});
keys?.lock();
// Write the report before scanning so the scan includes report/error details too.
const report=()=>fs.writeFileSync(path.join(out,'vault-result.json'),JSON.stringify({checks},null,2));report();
await check('secret scan',()=>{for(const f of files(out)){const b=fs.readFileSync(f);for(const s of secrets)assert(!b.includes(s),`credential found in ${f}`);}return 'all output files scanned';});report();
for(const c of checks)console.log(`${c.ok?'PASS':'FAIL'} ${c.name}: ${c.detail}`);process.exitCode=checks.some(c=>!c.ok)?1:0;
})().catch(()=>{process.exitCode=1;});
