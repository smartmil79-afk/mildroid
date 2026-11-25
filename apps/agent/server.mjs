import http from 'node:http';
import {spawn} from 'node:child_process';
import {randomBytes,timingSafeEqual} from 'node:crypto';
const HOST='127.0.0.1',PORT=Number(process.env.MIFASK_AGENT_PORT||47821);
const TOKEN=process.env.MIFASK_AGENT_TOKEN||randomBytes(24).toString('hex');
const ALLOWED_ORIGIN=process.env.MIFASK_WEB_ORIGIN||'http://localhost:5173';
const ADB=process.env.MIFASK_ADB_PATH||'adb';
function safeEqual(a,b){try{const x=Buffer.from(a),y=Buffer.from(b);return x.length===y.length&&timingSafeEqual(x,y)}catch{return false}}
function adb(args){return new Promise((resolve,reject)=>{const p=spawn(ADB,args,{windowsHide:true,shell:false});let out='',err='';p.stdout.on('data',d=>out+=d);p.stderr.on('data',d=>err+=d);p.on('error',reject);p.on('close',code=>code===0?resolve(out):reject(new Error(err||'ADB exited with code '+code)))})}
async function listDevices(){const output=await adb(['devices','-l']);return output.trim().split(/\r?\n/).slice(1).filter(Boolean).map(line=>{const parts=line.trim().split(/\s+/);const serial=parts.shift();const state=parts.shift()||'unknown';return{serial,state,model:parts.find(x=>x.startsWith('model:'))?.slice(6),product:parts.find(x=>x.startsWith('product:'))?.slice(8)}})}
function parseProps(raw){const props={};for(const line of raw.split(/\r?\n/)){const m=line.match(/^\[([^\]]+)\]: \[(.*)\]$/);if(m)props[m[1]]=m[2]}return props}
function parseBattery(raw){const pick=k=>raw.split(/\r?\n/).map(line=>line.trim()).find(line=>line.startsWith(k+':'))?.slice(k.length+1).trim();const parseNumber=v=>{if(v===undefined||v==='')return null;const n=Number(v);return Number.isFinite(n)?n:null};const level=parseNumber(pick('level'));const status=parseNumber(pick('status'));const tenths=parseNumber(pick('temperature'));return{level:level!==null&&level>=0&&level<=100?level:null,chargingStatus:({1:'Unknown',2:'Charging',3:'Discharging',4:'Not charging',5:'Full'})[status??0]||'Unknown',temperatureC:tenths!==null&&tenths>0?tenths/10:null}}
function parseStorage(raw){const lines=raw.trim().split(/\r?\n/);const row=lines.slice(1).find(x=>x.includes('/data'));if(!row)return null;const p=row.trim().split(/\s+/);const total=Number(p[1]),used=Number(p[2]),available=Number(p[3]);if(!Number.isFinite(total)||total<=0)return null;return{totalBytes:total*1024,usedBytes:used*1024,availableBytes:available*1024,usedPercent:Math.round(used/total*100)}}
async function deviceInfo(serial){const devices=await listDevices();const found=devices.find(d=>d.serial===serial);if(!found)throw Object.assign(new Error('Device is no longer connected.'),{status:404});if(found.state!=='device')throw Object.assign(new Error('Device is not authorised for USB debugging.'),{status:409});
 const [propRaw,batteryRaw,storageRaw,packagesRaw]=await Promise.all([adb(['-s',serial,'shell','getprop']),adb(['-s',serial,'shell','dumpsys','battery']),adb(['-s',serial,'shell','df','-k','/data']),adb(['-s',serial,'shell','pm','list','packages'])]);
 const p=parseProps(propRaw);const packages=packagesRaw.split(/\r?\n/).map(x=>x.trim().replace(/^package:/,'')).filter(Boolean).sort();
 return{device:{serial,manufacturer:p['ro.product.manufacturer']||'Unknown',model:p['ro.product.marketname']||p['ro.product.model']||found.model||'Unknown',product:p['ro.build.product']||found.product||'Unknown',androidVersion:p['ro.build.version.release']||'Unknown',sdk:p['ro.build.version.sdk']||'Unknown',build:p['ro.build.display.id']||'Unknown'},battery:parseBattery(batteryRaw),storage:parseStorage(storageRaw),applications:packages.map(packageName=>({packageName})),applicationCount:packages.length,readOnly:true};
}
const server=http.createServer(async(req,res)=>{
 const origin=req.headers.origin;
 if(origin&&origin!==ALLOWED_ORIGIN){res.writeHead(403);return res.end('Origin not allowed')}
 if(origin){res.setHeader('Access-Control-Allow-Origin',origin);res.setHeader('Vary','Origin');res.setHeader('Access-Control-Allow-Headers','Authorization, Content-Type');res.setHeader('Access-Control-Allow-Methods','GET, OPTIONS')}
 res.setHeader('Cache-Control','no-store');res.setHeader('Content-Type','application/json; charset=utf-8');
 if(req.method==='OPTIONS'){res.writeHead(204);return res.end()}
 if(req.url==='/health'&&req.method==='GET'){res.writeHead(200);return res.end(JSON.stringify({ok:true,service:'MIFASK Local Agent'}))}
 const auth=req.headers.authorization||'';
 if(!auth.startsWith('Bearer ')||!safeEqual(auth.slice(7),TOKEN)){res.writeHead(401);return res.end(JSON.stringify({error:'Unauthorised'}))}
 try{
  if(req.url==='/api/devices'&&req.method==='GET'){const devices=await listDevices();res.writeHead(200);return res.end(JSON.stringify({devices}))}
  const url=new URL(req.url,'http://127.0.0.1');
  if(url.pathname==='/api/device-info'&&req.method==='GET'){const serial=url.searchParams.get('serial')||'';if(!serial||serial.length>256){res.writeHead(400);return res.end(JSON.stringify({error:'A valid device serial is required.'}))}const info=await deviceInfo(serial);res.writeHead(200);return res.end(JSON.stringify(info))}
  res.writeHead(404);return res.end(JSON.stringify({error:'Not found'}))
 }catch(e){const status=e.status||503;res.writeHead(status);return res.end(JSON.stringify({error:e instanceof Error?e.message:'ADB request failed'}))}
});
server.listen(PORT,HOST,()=>{console.log('MIFASK Local Agent listening at http://'+HOST+':'+PORT);console.log('Allowed browser origin: '+ALLOWED_ORIGIN);console.log('Access token (keep private): '+TOKEN);console.log('Exposes read-only device discovery and device information.')});
,'im'))?.[1]?.trim();const parseNumber=v=>{if(v===undefined||v==='')return null;const n=Number(v);return Number.isFinite(n)?n:null};const level=parseNumber(pick('level'));const status=parseNumber(pick('status'));const tenths=parseNumber(pick('temperature'));return{level:level!==null&&level>=0&&level<=100?level:null,chargingStatus:({1:'Unknown',2:'Charging',3:'Discharging',4:'Not charging',5:'Full'})[status??0]||'Unknown',temperatureC:tenths!==null&&tenths>0?tenths/10:null}}
function parseStorage(raw){const lines=raw.trim().split(/\r?\n/);const row=lines.slice(1).find(x=>x.includes('/data'));if(!row)return null;const p=row.trim().split(/\s+/);const total=Number(p[1]),used=Number(p[2]),available=Number(p[3]);if(!Number.isFinite(total)||total<=0)return null;return{totalBytes:total*1024,usedBytes:used*1024,availableBytes:available*1024,usedPercent:Math.round(used/total*100)}}
async function deviceInfo(serial){const devices=await listDevices();const found=devices.find(d=>d.serial===serial);if(!found)throw Object.assign(new Error('Device is no longer connected.'),{status:404});if(found.state!=='device')throw Object.assign(new Error('Device is not authorised for USB debugging.'),{status:409});
 const [propRaw,batteryRaw,storageRaw,packagesRaw]=await Promise.all([adb(['-s',serial,'shell','getprop']),adb(['-s',serial,'shell','dumpsys','battery']),adb(['-s',serial,'shell','df','-k','/data']),adb(['-s',serial,'shell','pm','list','packages'])]);
 const p=parseProps(propRaw);const packages=packagesRaw.split(/\r?\n/).map(x=>x.trim().replace(/^package:/,'')).filter(Boolean).sort();
 return{device:{serial,manufacturer:p['ro.product.manufacturer']||'Unknown',model:p['ro.product.marketname']||p['ro.product.model']||found.model||'Unknown',product:p['ro.build.product']||found.product||'Unknown',androidVersion:p['ro.build.version.release']||'Unknown',sdk:p['ro.build.version.sdk']||'Unknown',build:p['ro.build.display.id']||'Unknown'},battery:parseBattery(batteryRaw),storage:parseStorage(storageRaw),applications:packages.map(packageName=>({packageName})),applicationCount:packages.length,readOnly:true};
}
const server=http.createServer(async(req,res)=>{
 const origin=req.headers.origin;
 if(origin&&origin!==ALLOWED_ORIGIN){res.writeHead(403);return res.end('Origin not allowed')}
 if(origin){res.setHeader('Access-Control-Allow-Origin',origin);res.setHeader('Vary','Origin');res.setHeader('Access-Control-Allow-Headers','Authorization, Content-Type');res.setHeader('Access-Control-Allow-Methods','GET, OPTIONS')}
 res.setHeader('Cache-Control','no-store');res.setHeader('Content-Type','application/json; charset=utf-8');
 if(req.method==='OPTIONS'){res.writeHead(204);return res.end()}
 if(req.url==='/health'&&req.method==='GET'){res.writeHead(200);return res.end(JSON.stringify({ok:true,service:'MIFASK Local Agent'}))}
 const auth=req.headers.authorization||'';
 if(!auth.startsWith('Bearer ')||!safeEqual(auth.slice(7),TOKEN)){res.writeHead(401);return res.end(JSON.stringify({error:'Unauthorised'}))}
 try{
  if(req.url==='/api/devices'&&req.method==='GET'){const devices=await listDevices();res.writeHead(200);return res.end(JSON.stringify({devices}))}
  const url=new URL(req.url,'http://127.0.0.1');
  if(url.pathname==='/api/device-info'&&req.method==='GET'){const serial=url.searchParams.get('serial')||'';if(!serial||serial.length>256){res.writeHead(400);return res.end(JSON.stringify({error:'A valid device serial is required.'}))}const info=await deviceInfo(serial);res.writeHead(200);return res.end(JSON.stringify(info))}
  res.writeHead(404);return res.end(JSON.stringify({error:'Not found'}))
 }catch(e){const status=e.status||503;res.writeHead(status);return res.end(JSON.stringify({error:e instanceof Error?e.message:'ADB request failed'}))}
});
server.listen(PORT,HOST,()=>{console.log('MIFASK Local Agent listening at http://'+HOST+':'+PORT);console.log('Allowed browser origin: '+ALLOWED_ORIGIN);console.log('Access token (keep private): '+TOKEN);console.log('Exposes read-only device discovery and device information.')});
