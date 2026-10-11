import {env} from 'cloudflare:workers';
import {getChatGPTUser} from '../../chatgpt-auth';
import catalog from '../../../data/catalog.json';
import {Product,quoteOrder,isAdmin,safeUrl} from '../../../lib/commerce';
export const dynamic='force-dynamic';
const json=(data:unknown,status=200)=>Response.json(data,{status,headers:{'Cache-Control':'no-store'}});
const clean=(s:unknown,n=300)=>String(s??'').trim().slice(0,n);
const db=()=>{if(!env.DB)throw Error('The store database is not connected.');return env.DB;};
async function products(){const r=await db().prepare('SELECT id,data FROM inventory').all<{id:string,data:string}>();const map=new Map((catalog.products as Product[]).map(p=>[p.id,p]));for(const p of r.results)map.set(p.id,JSON.parse(p.data));return [...map.values()];}
const rows=(r:{results:Record<string,unknown>[]})=>r.results.map(x=>({...x,...JSON.parse(String(x.data)),data:undefined}));
export async function GET(req:Request){try{const user=await getChatGPTUser();const action=new URL(req.url).searchParams.get('action')||'boot';
 if(action==='boot'){const settings=await db().prepare("SELECT data FROM settings WHERE id='public'").first<{data:string}>();return json({products:await products(),colors:catalog.colors,user:user?{name:user.displayName,email:user.email,admin:isAdmin(user.email)}:null,settings:settings?JSON.parse(settings.data):{socials:{},press:[]}});}
 if(!user)return json({error:'Please sign in to your account.'},401);
 if(action==='account'){const profile=await db().prepare('SELECT data FROM profiles WHERE id=?').bind(user.userId).first<{data:string}>();return json({profile:profile?JSON.parse(profile.data):null,orders:rows(await db().prepare('SELECT * FROM orders WHERE user_id=? ORDER BY created DESC LIMIT 100').bind(user.userId).all()),applications:rows(await db().prepare('SELECT * FROM applications WHERE user_id=? ORDER BY created DESC').bind(user.userId).all()),commissions:(await db().prepare("SELECT o.id,o.created,o.status,json_extract(o.data,'$.affiliate') AS affiliate FROM orders o JOIN applications a ON a.id=json_extract(o.data,'$.affiliate.id') WHERE a.user_id=? AND a.type='Affiliate' ORDER BY o.created DESC LIMIT 100").bind(user.userId).all()).results.map((r:any)=>({id:r.id,created:r.created,status:r.status,...JSON.parse(r.affiliate||'{}')}))});}
 if(action==='admin'){if(!isAdmin(user.email))return json({error:'Owner access required.'},403);return json({orders:rows(await db().prepare('SELECT * FROM orders ORDER BY created DESC LIMIT 250').all()),applications:rows(await db().prepare('SELECT * FROM applications ORDER BY created DESC LIMIT 250').all()),inquiries:rows(await db().prepare('SELECT * FROM inquiries ORDER BY created DESC LIMIT 250').all())});}
 return json({error:'Unknown request.'},404);
 }catch(e){return json({error:e instanceof Error?e.message:'Store unavailable.'},500);}}
export async function POST(req:Request){try{
 if(req.headers.get('origin')!==new URL(req.url).origin)return json({error:'Same-origin requests required.'},403);
 const user=await getChatGPTUser();if(!user)return json({error:'Please sign in to your account.'},401);
 const raw=await req.text();if(raw.length>100000)return json({error:'Request too large.'},413);const b=JSON.parse(raw);const now=new Date().toISOString();const action=b.action;
 if(action==='profile'){
 if(!b.adult||!b.terms||!b.privacy||!clean(b.signature))throw Error('An adult account holder must sign and accept the account and privacy terms.');
 const data={name:clean(b.name),country:clean(b.country),signature:clean(b.signature),adult:true,terms:true,privacy:true,guardian:b.guardian===true,consentVersion:'2026-10-11',signedAt:now};
 await db().prepare('INSERT INTO profiles(id,email,data,updated) VALUES(?,?,?,?) ON CONFLICT(id) DO UPDATE SET email=excluded.email,data=excluded.data,updated=excluded.updated').bind(user.userId,user.email,JSON.stringify(data),now).run();return json({ok:true,profile:data});}
 if(action==='order'){
 const profile=await db().prepare('SELECT data FROM profiles WHERE id=?').bind(user.userId).first();if(!profile)throw Error('Complete your account acceptance before ordering.');
 if(!b.acceptDemo)throw Error('Please acknowledge that no payment or shipment is taken in this demo.');
 const key=clean(b.requestId,80);if(!/^[a-zA-Z0-9-]{8,80}$/.test(key))throw Error('Order reference missing.');
 const existing=await db().prepare('SELECT * FROM orders WHERE id=? AND user_id=?').bind(key,user.userId).first();if(existing)return json({ok:true,order:{...existing,...JSON.parse(String(existing.data))}});
 let wholesale=false;if(b.wholesale){const approved=await db().prepare("SELECT id FROM applications WHERE user_id=? AND type='Retailer' AND status='Approved' LIMIT 1").bind(user.userId).first();if(!approved)throw Error('An approved retailer account is required for trade pricing.');wholesale=true;}
 const q=quoteOrder(await products(),b.items,wholesale);
 if(q.items.some(i=>i.status==='Pre-order')&&!b.acceptPreorder)throw Error('Please accept the displayed pre-order dates.');
 let affiliate=null;if(b.referral&&!wholesale){const a=await db().prepare("SELECT * FROM applications WHERE type='Affiliate' AND status='Approved' AND id=? AND user_id<>?").bind(clean(b.referral),user.userId).first();if(a)affiliate={id:a.id,commission:Math.round(q.total*.1),status:'Pending',eligibleAfter:new Date(Date.now()+30*86400000).toISOString()};}
 const data={...q,customer:user.email,name:clean(b.name),country:clean(b.country),city:clean(b.city),wholesale,affiliate,mode:'Demo — no payment or shipment',acceptedPreorder:b.acceptPreorder===true};
 if(!data.name||!data.country)throw Error('Add your name and country.');
 await db().prepare('INSERT INTO orders(id,user_id,status,total,data,created) VALUES(?,?,?,?,?,?)').bind(key,user.userId,'Received',q.total,JSON.stringify(data),now).run();return json({ok:true,order:{id:key,status:'Received',created:now,...data}});}
 if(action==='cancelOrder'){const r=await db().prepare('SELECT * FROM orders WHERE id=? AND user_id=?').bind(clean(b.id),user.userId).first();if(!r)throw Error('Order not found.');if(r.status!=='Received')throw Error('Please contact the house to amend this order.');const d=JSON.parse(String(r.data));if(d.affiliate)d.affiliate.status='Voided';await db().prepare("UPDATE orders SET status='Cancelled',data=? WHERE id=? AND user_id=?").bind(JSON.stringify(d),r.id,user.userId).run();return json({ok:true});}
 if(action==='application'){
 if(!['Retailer','Affiliate'].includes(b.type))throw Error('Choose a partner programme.');if(!b.accept)throw Error('Please accept the partner terms.');
 const existing=await db().prepare('SELECT id FROM applications WHERE user_id=? AND type=? LIMIT 1').bind(user.userId,b.type).first();if(existing)throw Error('Your application is already on file. View its status in your account.');
 const id=(b.type==='Affiliate'?'DC-':'TRADE-')+crypto.randomUUID().slice(0,8).toUpperCase();const d={name:clean(b.name),company:clean(b.company),email:user.email,country:clean(b.country),website:safeUrl(clean(b.website)),message:clean(b.message,2000),acceptedAt:now};if(!d.name||!d.company||!d.country)throw Error('Name, business and country are required.');await db().prepare('INSERT INTO applications(id,user_id,type,status,data,created) VALUES(?,?,?,?,?,?)').bind(id,user.userId,b.type,'Pending',JSON.stringify(d),now).run();return json({ok:true,id});}
 if(action==='inquiry'){const d={name:clean(b.name),email:user.email,subject:clean(b.subject),message:clean(b.message,3000)};if(!d.name||!d.message)throw Error('Add your name and message.');await db().prepare('INSERT INTO inquiries(id,user_id,data,created) VALUES(?,?,?,?)').bind(crypto.randomUUID(),user.userId,JSON.stringify(d),now).run();return json({ok:true});}
 if(!isAdmin(user.email))return json({error:'Owner access required.'},403);
 if(action==='inventory'){
 const p=b.product as Product;if(!/^[a-z0-9-]{1,80}$/.test(p.id)||!clean(p.name)||!Number.isFinite(p.price)||p.price<1||p.price>100000||!Number.isInteger(p.stock)||p.stock<0)throw Error('Check the style ID, price and stock.');
 if(!['In stock','Pre-order','Coming soon','Out of stock'].includes(p.status)||!Array.isArray(p.colors)||!p.colors.length||p.colors.some(v=>!clean(v))||!Array.isArray(p.sizes)||!p.sizes.length||p.sizes.some(v=>!clean(v)))throw Error('Add a valid status, colours and sizes.');
 if(p.status==='Pre-order'&&!/^\d{4}-\d{2}-\d{2}$/.test(p.availableDate))throw Error('Pre-orders require a dispatch date.');
 if(!/^\/(assets\/[a-zA-Z0-9_.-]+|api\/media\/[a-zA-Z0-9_.-]+)$/.test(p.image))throw Error('Upload a product image or choose an existing asset.');
 const data={...p,name:clean(p.name),description:clean(p.description,2000),colors:p.colors.slice(0,20).map(v=>clean(v,40)),sizes:p.sizes.slice(0,30).map(v=>clean(v,30)),gender:p.gender.filter(g=>['Men','Women','Kids'].includes(g)),details:(p.details||[]).slice(0,8).map(v=>clean(v)),category:clean(p.category,60),season:clean(p.season,60)};
 await db().prepare('INSERT INTO inventory(id,data) VALUES(?,?) ON CONFLICT(id) DO UPDATE SET data=excluded.data').bind(p.id,JSON.stringify(data)).run();return json({ok:true});}
 if(action==='reviewApplication'){if(!['Approved','Declined','Pending'].includes(b.status))throw Error('Invalid status.');await db().prepare('UPDATE applications SET status=? WHERE id=?').bind(b.status,clean(b.id)).run();return json({ok:true});}
 if(action==='orderStatus'){if(!['Received','Preparing','Dispatched','Completed','Cancelled'].includes(b.status))throw Error('Invalid order status.');const r=await db().prepare('SELECT data FROM orders WHERE id=?').bind(clean(b.id)).first<{data:string}>();if(!r)throw Error('Order not found.');const d=JSON.parse(r.data);if(d.affiliate)d.affiliate.status=b.status==='Cancelled'?'Voided':'Pending';await db().prepare('UPDATE orders SET status=?,data=? WHERE id=?').bind(b.status,JSON.stringify(d),clean(b.id)).run();return json({ok:true});}
 if(action==='approveCommission'){const r=await db().prepare('SELECT data,status FROM orders WHERE id=?').bind(clean(b.id)).first<{data:string,status:string}>();if(!r)throw Error('Order not found.');const d=JSON.parse(r.data);if(r.status!=='Completed'||!d.affiliate||Date.parse(d.affiliate.eligibleAfter)>Date.now())throw Error('Commission requires a completed order and a 30-day review period.');d.affiliate.status='Approved for review';await db().prepare('UPDATE orders SET data=? WHERE id=?').bind(JSON.stringify(d),clean(b.id)).run();return json({ok:true});}
 if(action==='settings'){const d={socials:Object.fromEntries(Object.entries(b.socials||{}).filter(([k])=>['Instagram','TikTok','LinkedIn','Pinterest'].includes(k)).map(([k,v])=>[k,safeUrl(String(v))])),press:(b.press||[]).slice(0,20).map((p:{title:string,url:string})=>({title:clean(p.title),url:safeUrl(p.url)})).filter((p:{url:string})=>p.url),filmUrl:safeUrl(clean(b.filmUrl))};await db().prepare("INSERT INTO settings(id,data) VALUES('public',?) ON CONFLICT(id) DO UPDATE SET data=excluded.data").bind(JSON.stringify(d)).run();return json({ok:true});}
 return json({error:'Unknown action.'},404);
 }catch(e){return json({error:e instanceof Error?e.message:'Unable to save.'},400);}}
