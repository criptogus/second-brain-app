import fs from 'node:fs';
import path from 'node:path';
import { randomBytes } from 'node:crypto';
import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import assert from 'node:assert/strict';
const arg=n=>{const i=process.argv.indexOf(n);assert(i>=0&&process.argv[i+1],`Missing ${n}`);return path.resolve(process.argv[i+1]);};
const resources=arg('--resources'),exe=arg('--exe'),out=arg('--out'),corp=path.join(resources,'corp');fs.mkdirSync(out,{recursive:true});
const secrets=[randomBytes(32).toString('hex')],password=secrets[0],marker='corpsmoke'+randomBytes(12).toString('hex'),checks=[];
const clean=s=>secrets.reduce((v,k)=>v.split(k).join('[REDACTED]'),String(s));
async function check(name,fn){try{checks.push({name,ok:true,detail:clean(await fn()||'passed')});}catch(e){checks.push({name,ok:false,detail:clean(e.stack||e)});}}
function files(dir){return fs.readdirSync(dir,{withFileTypes:true}).flatMap(e=>e.isDirectory()?files(path.join(dir,e.name)):e.isFile()?[path.join(dir,e.name)]:[]);}
function launch(script,env={}){
 const scratch=path.join(out,'tmp');fs.mkdirSync(scratch,{recursive:true});
 const p=spawn(exe,[path.join(corp,script)],{cwd:corp,env:{...process.env,ELECTRON_RUN_AS_NODE:'1',TMPDIR:scratch,TEMP:scratch,TMP:scratch,...env},stdio:['ignore','pipe','pipe']});
 let stdout='',stderr='';p.stdout.on('data',b=>stdout+=b);p.stderr.on('data',b=>stderr+=b);
 const done=new Promise(resolve=>{p.on('error',e=>resolve({error:clean(e.message)}));p.on('close',code=>resolve({code}));});
 return {p,done,save:prefix=>{fs.writeFileSync(path.join(out,prefix+'-stdout.log'),clean(stdout));fs.writeFileSync(path.join(out,prefix+'-stderr.log'),clean(stderr));}};
}
await check('corp shipped in installer',()=>{assert(fs.existsSync(path.join(corp,'server.mjs')),'corp not shipped in installer');});
await check('packaged selfcheck',async()=>{
 const c=launch('selfcheck.mjs');let timed=false;const timer=setTimeout(()=>{timed=true;c.p.kill('SIGKILL');},180000);
 try{const r=await c.done;assert(!timed,'selfcheck timeout');c.save('selfcheck');assert.equal(r.code,0,clean(fs.readFileSync(path.join(out,'selfcheck-stderr.log'),'utf8').slice(-4000)||JSON.stringify(r)));}finally{clearTimeout(timer);c.save('selfcheck');}
});
await check('Corp health, owner, token and MCP HTTP',async()=>{
 const probe=createServer();await new Promise((resolve,reject)=>{probe.once('error',reject);probe.listen(0,'127.0.0.1',resolve);});const port=probe.address().port;await new Promise(resolve=>probe.close(resolve));
 // Private server data stays in --out; the generated credential is only in env.
 const c=launch('server.mjs',{KEEPMIND_CORP_HOST:'127.0.0.1',KEEPMIND_CORP_PORT:String(port),KEEPMIND_CORP_DATA:path.join(out,'data'),KEEPMIND_VAULT:path.join(out,'vault'),KEEPMIND_CORP_ORG_NAME:'Install Smoke',KEEPMIND_CORP_OWNER_EMAIL:'smoke@example.com',KEEPMIND_CORP_OWNER_PASSWORD:password});
 const timer=setTimeout(()=>c.p.kill('SIGKILL'),120000);let cookie='';
 async function call(route,{method='GET',body,bearer}={}){
 const r=await fetch(`http://127.0.0.1:${port}${route}`,{method,signal:AbortSignal.timeout(10000),headers:{'content-type':'application/json',...(method==='GET'?{}:{'x-keepmind-corp':'1'}),...(bearer?{authorization:`Bearer ${bearer}`}:{cookie})},body:body?JSON.stringify(body):undefined});
 const text=await r.text();let json;try{json=JSON.parse(text);}catch{json={};}return {status:r.status,json,text,cookie:r.headers.get('set-cookie')?.split(';')[0]};
 }
 try{
 let health;const until=Date.now()+60000;while(Date.now()<until){try{health=await call('/api/health');if(health.status===200)break;}catch{}if(c.p.exitCode!==null)throw Error('server exited during startup');await new Promise(r=>setTimeout(r,250));}
 assert.equal(health?.status,200,'health timeout');fs.writeFileSync(path.join(out,'health.json'),JSON.stringify(health.json,null,2));
 const meta=await call('/api/meta');assert.equal(meta.status,200);fs.writeFileSync(path.join(out,'meta.json'),JSON.stringify(meta.json,null,2));
 const login=await call('/api/login',{method:'POST',body:{email:'smoke@example.com',password}});assert.equal(login.status,200);cookie=login.cookie;assert(cookie?.startsWith('kmcorp='));secrets.push(cookie);
 const agents=await call('/api/agents');assert.equal(agents.status,200);assert.equal((await call('/api/agents',{method:'PUT',body:{agents:agents.json.agents.map(a=>['composer','sync'].includes(a.id)?{...a,enabled:true}:a)}})).status,200);
 const session=await call('/api/session');assert.equal(session.status,200);const ownerId=session.json.user?.id;assert(ownerId,'owner id missing');assert.equal(session.json.user.role,'owner');
 const mint=await call('/api/sync-tokens',{method:'POST',body:{label:'install-smoke',userId:ownerId}});assert.equal(mint.status,201,`mint ${mint.status} ${mint.json.error||''}`);const token=mint.json.token.secret;assert(token);secrets.push(token);
 const imported=await call('/api/brain/import',{method:'POST',bearer:token,body:{files:[{path:'inbox/install-smoke.md',content:`# Smoke\n\n${marker}\n`}]}});assert.equal(imported.status,200);assert.equal(imported.json.imported,1);
 const tools=await call('/api/mcp/tools',{bearer:token});assert.equal(tools.status,200);const toolNames=tools.json.tools.map(t=>t.name);assert(toolNames.includes('sb_search'));fs.writeFileSync(path.join(out,'mcp-tool-names.json'),JSON.stringify(toolNames,null,2));fs.writeFileSync(path.join(out,'mcp-tools.json'),JSON.stringify(tools.json,null,2));
 const result=await call('/api/mcp/call',{method:'POST',bearer:token,body:{agentId:'composer',tool:'sb_search',arguments:{query:marker}}});assert.equal(result.status,200);assert(result.text.includes(marker),'MCP search did not find marker');
 assert.equal((await call('/api/mcp/tools',{bearer:'invalid-install-smoke'})).status,401);
 return 'health/meta, owner login, agent enable, brain import, bearer tools/search and invalid bearer 401';
 }finally{clearTimeout(timer);c.p.kill();const kill=setTimeout(()=>c.p.kill('SIGKILL'),5000);await c.done;clearTimeout(kill);c.save('server');}
});
checks.push({name:'optional Corp stdio',ok:true,skipped:true,detail:'mcp-stdio-server.mjs exports runStdioMcpServer with in-process getOrg/getUser/vault bindings; no standalone entry point. HTTP MCP is checked separately above.'});
const report=()=>fs.writeFileSync(path.join(out,'corp-result.json'),JSON.stringify({checks},null,2));report();
await check('secret scan',()=>{for(const f of files(out)){const b=fs.readFileSync(f);for(const s of secrets)assert(!b.includes(s),`credential found in ${f}`);}return 'all output files scanned';});report();
for(const c of checks)console.log(`${c.ok?'PASS':'FAIL'} ${c.name}: ${c.detail}`);process.exitCode=checks.some(c=>!c.ok)?1:0;
