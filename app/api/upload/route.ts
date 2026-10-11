import {env} from 'cloudflare:workers';
import {getChatGPTUser} from '../../chatgpt-auth';
import {isAdmin} from '../../../lib/commerce';
export async function POST(req:Request){
 if(req.headers.get('origin')!==new URL(req.url).origin)return Response.json({error:'Same-origin required.'},{status:403});
 const u=await getChatGPTUser();if(!u||!isAdmin(u.email))return Response.json({error:'Owner access required.'},{status:403});
 try{if(Number(req.headers.get('content-length')||0)>9*1024*1024)throw Error('Upload exceeds 8 MB image limit.');if(!env.BUCKET)throw Error('Image storage unavailable.');const form=await req.formData();const f=form.get('image');if(!(f instanceof File)||f.size>8*1024*1024)throw Error('Choose a JPEG, PNG or WebP image under 8 MB.');const bytes=new Uint8Array(await f.arrayBuffer());let ext='';if(bytes[0]===255&&bytes[1]===216&&bytes[2]===255)ext='jpg';if(bytes[0]===137&&bytes[1]===80&&bytes[2]===78&&bytes[3]===71)ext='png';if(new TextDecoder().decode(bytes.slice(0,4))==='RIFF'&&new TextDecoder().decode(bytes.slice(8,12))==='WEBP')ext='webp';if(!ext)throw Error('Unsupported image format.');const key=crypto.randomUUID()+'.'+ext;await env.BUCKET.put('inventory/'+key,bytes,{httpMetadata:{contentType:ext==='jpg'?'image/jpeg':'image/'+ext}});return Response.json({url:'/api/media/'+key});}catch(e){return Response.json({error:e instanceof Error?e.message:'Upload failed.'},{status:400});}
}
