import http from 'node:http';
import {spawn} from 'node:child_process';
import {randomBytes,timingSafeEqual} from 'node:crypto';
const HOST='127.0.0.1',PORT=Number(process.env.MIFASK_AGENT_PORT||47821);
const TOKEN=process.env.MIFASK_AGENT_TOKEN||randomBytes(24).toString('hex');
const ALLOWED_ORIGIN=process.env.MIFASK_WEB_ORIGIN||'http://localhost:5173';
const ADB=process.env.MIFASK_ADB_PATH||'adb';
function safeEqual(a,b){try{const x=Buffer.from(a),y=Buffer.from(b);return x.length===y.length&&timingSafeEqual(x,y)}catch{return false}}
function listDevices(){return new Promise((resolve,reject)=>{const p=spawn(ADB,['devices','-l'],{windowsHide:true,shell:false});let out='',err='';p.stdout.on('data',d=>out+=d);p.stderr.on('data',d=>err+=d);p.on('error',reject);p.on('close',code=>code===0?resolve(out):reject(new Error(err||'ADB exited with code '+code)))})}
const server=http.createServer(async(req,res)=>{
 const origin=req.headers.origin;
 if(origin&&origin!==ALLOWED_ORIGIN){res.writeHead(403);return res.end('Origin not allowed')}
 if(origin){res.setHeader('Access-Control-Allow-Origin',origin);res.setHeader('Vary','Origin');res.setHeader('Access-Control-Allow-Headers','Authorization, Content-Type');res.setHeader('Access-Control-Allow-Methods','GET, OPTIONS')}
 res.setHeader('Cache-Control','no-store');res.setHeader('Content-Type','application/json; charset=utf-8');
 if(req.method==='OPTIONS'){res.writeHead(204);return res.end()}
 if(req.url==='/health'&&req.method==='GET'){res.writeHead(200);return res.end(JSON.stringify({ok:true,service:'MIFASK Local Agent'}))}
 if(req.url!=='/api/devices'||req.method!=='GET'){res.writeHead(404);return res.end(JSON.stringify({error:'Not found'}))}
 const auth=req.headers.authorization||'';
 if(!auth.startsWith('Bearer ')||!safeEqual(auth.slice(7),TOKEN)){res.writeHead(401);return res.end(JSON.stringify({error:'Unauthorised'}))}
 try{const output=await listDevices();const lines=output.trim().split(/\r?\n/).slice(1);const devices=lines.filter(Boolean).map(line=>{const parts=line.trim().split(/\s+/);const serial=parts.shift();const state=parts.shift()||'unknown';return{serial,state,model:parts.find(x=>x.startsWith('model:'))?.slice(6),product:parts.find(x=>x.startsWith('product:'))?.slice(8)}});res.writeHead(200);res.end(JSON.stringify({devices}))}
 catch(e){res.writeHead(503);res.end(JSON.stringify({error:e instanceof Error?e.message:'ADB unavailable'}))}
});
server.listen(PORT,HOST,()=>{console.log('MIFASK Local Agent listening at http://'+HOST+':'+PORT);console.log('Allowed browser origin: '+ALLOWED_ORIGIN);console.log('Access token (keep private): '+TOKEN);console.log('Exposes read-only device discovery only.')});