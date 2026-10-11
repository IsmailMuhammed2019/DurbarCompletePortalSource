export type Product={id:string;name:string;category:string;gender:string[];image:string;pictured:string;colors:string[];sizes:string[];price:number;description:string;status:string;stock:number;season:string;availableDate:string;details:string[];variantImages?:Record<string,string>};
export type BagItem={id:string;color:string;size:string;quantity:number};
export function quoteOrder(products:Product[],items:BagItem[],wholesale=false){
 if(!Array.isArray(items)||!items.length||items.length>40)throw Error('Choose between 1 and 40 styles.');
 const counts:Record<string,number>={};
 const lines=items.map(i=>{const p=products.find(p=>p.id===i.id);if(!p)throw Error('A style is no longer available.');
 if(!Number.isInteger(i.quantity)||i.quantity<1||i.quantity>50)throw Error('Quantity must be between 1 and 50.');
 if(!p.colors.includes(i.color)||!p.sizes.includes(i.size))throw Error('Select a valid colour and size.');
 if(!['In stock','Pre-order'].includes(p.status))throw Error(`${p.name} is not available to order.`);
 counts[p.id]=(counts[p.id]||0)+i.quantity;
 if(p.status==='In stock'&&counts[p.id]>p.stock)throw Error(`${p.name}: quantity exceeds available demo inventory.`);
 if(p.status==='Pre-order'&&!p.availableDate)throw Error('A pre-order dispatch date is required.');
 const unitPrice=Math.round(p.price*100*(wholesale?.6:1));
 return {...i,name:p.name,image:p.image,unitPrice,subtotal:unitPrice*i.quantity,status:p.status,dispatchDate:p.availableDate};});
 if(wholesale&&lines.reduce((s,i)=>s+i.quantity,0)<12)throw Error('Trade opening orders require at least 12 pieces.');
 return {items:lines,total:lines.reduce((s,i)=>s+i.subtotal,0)};
}
export function isAdmin(email?:string){return email?.toLowerCase()==='muchato@gmail.com';}
export function safeUrl(value:string){try{const u=new URL(value);return u.protocol==='https:'?u.href:'';}catch{return '';}}
