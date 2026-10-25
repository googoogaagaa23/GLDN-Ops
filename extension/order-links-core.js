(function(root,factory){const api=factory();if(typeof module!=='undefined'&&module.exports)module.exports=api;if(root)root.GLDN_ORDER_LINKS=api;})(globalThis,()=>{
  'use strict';
  const text=value=>String(value??'').replace(/\s+/g,' ').trim();
  const ebayId=value=>/^\d{2}-\d{5}-\d{5}$/.test(text(value))?text(value):'';
  const amazonId=value=>/^\d{3}-\d{7}-\d{7}$/.test(text(value))?text(value):'';
  const label=value=>text(value).toUpperCase();
  function ebayPage(value){
    try{const u=new URL(value);return u.protocol==='https:'&&/(^|\.)ebay\.com$/.test(u.hostname)&&(/^\/(?:mesh|sh)\/ord\/details(?:\/|$)/.test(u.pathname)||/^\/(?:rtn|return|returns|post-order)(?:\/|$)/.test(u.pathname));}catch{return false;}
  }
  function orderFromUrl(value){
    try{const u=new URL(value);if(!ebayPage(u.href))return '';return ebayId(u.searchParams.get('orderid')||u.searchParams.get('orderId'));}catch{return '';}
  }
  function trackerPage(value){try{const u=new URL(value);return u.origin==='https://app.trackerbot.me'&&!/^\/demo(?:\/|$)/.test(u.pathname);}catch{return false;}}
  function asin(value){const raw=text(value);if(/^[A-Z0-9]{10}$/i.test(raw))return raw.toUpperCase();try{const decoded=atob(raw).trim();return /^[A-Z0-9]{10}$/i.test(decoded)?decoded.toUpperCase():'';}catch{return '';}}
  function profileFromNote(value){
    const parts=text(value).split(/\s+(?:-|\u2013|\u2014|\|)\s+/);
    return parts.length>=4&&/^\$?[\dOoIl.,]+$/.test(parts[0])&&/^\$?[\dOoIl.,]+$/.test(parts[1])?text(parts.slice(2,-1).join(' - ')):'';
  }
  function context(raw={}){
    const orderId=ebayId(raw.orderId);if(!orderId)throw Error('One exact eBay order number is required.');
    const notes=[...new Set((raw.notes||[]).map(text).filter(Boolean))];
    const profiles=[...new Set(notes.map(profileFromNote).filter(Boolean).map(label))];
    if(profiles.length>1)throw Error('This order has notes naming different Amazon profiles. Review them before opening Amazon.');
    return {orderId,profileLabel:profiles[0]||'',asins:[...new Set((raw.skus||[]).map(asin).filter(Boolean))],notes,sourceUrl:String(raw.sourceUrl||'')};
  }
  function trackerMatch(rows,orderId){
    if(!ebayId(orderId))throw Error('One exact eBay order number is required.');
    const matches=(rows||[]).filter(row=>ebayId(row.orderId)===ebayId(orderId)&&/amazon/i.test(text(row.supplier))).map(row=>({orderId:ebayId(row.orderId),amazonOrderId:amazonId(row.amazonOrderId),supplierEmail:text(row.supplierEmail).toLowerCase(),recordId:text(row.recordId),title:text(row.title)}));
    if((rows||[]).some(row=>ebayId(row.orderId)===ebayId(orderId)&&/amazon/i.test(text(row.supplier))&&!/^(?:amazon|amazon\s*us|amazon\.com)\.?$/i.test(text(row.supplier))))throw Error('This is not a supported Amazon US supplier. Review the correct marketplace manually.');
    const distinct=new Map();for(const row of matches)distinct.set([row.amazonOrderId,row.supplierEmail].join('|'),row);
    const values=[...distinct.values()];
    if(values.length>1)throw Error('Trackerbot has multiple supplier orders or accounts for this eBay order. Review the matching rows manually.');
    if(!values.length||!values[0].amazonOrderId)return null;
    return values[0];
  }
  function chooseMapping(mappings,profileLabel,supplierEmail){
    const named=(mappings||[]).filter(row=>label(row.label)===label(profileLabel)&&label(profileLabel));
    const emailed=(mappings||[]).filter(row=>text(supplierEmail)&&text(row.supplierEmail).toLowerCase()===text(supplierEmail).toLowerCase());
    if(named.length>1||emailed.length>1)throw Error('More than one Chrome profile matches. Correct the profile mapping first.');
    if(named[0]?.supplierEmail&&text(supplierEmail)&&text(named[0].supplierEmail).toLowerCase()!==text(supplierEmail).toLowerCase())throw Error('The Trackerbot supplier email differs from the email saved for this Amazon profile. Nothing was opened.');
    if(named[0]&&emailed[0]&&named[0].profileDirectory!==emailed[0].profileDirectory)throw Error('The eBay note and Trackerbot supplier email point to different Chrome profiles. Nothing was opened.');
    return named[0]||emailed[0]||null;
  }
  return Object.freeze({text,ebayId,amazonId,label,ebayPage,orderFromUrl,trackerPage,asin,profileFromNote,context,trackerMatch,chooseMapping});
});
