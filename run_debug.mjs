import { componentSpec } from './src/index.js';

(async function(){
  const steps = { trigger: { event: { body: { text: 'Prime Visa: You made a $75.96 transaction with COSTCO WHSE #1696 on Nov 12, 2025 at 7:40 PM ET.' } } } };
  const $ = { export: (k,v)=>{ console.log('exported',k,v); } };
  try{
    const out = await componentSpec.run({ steps, $ });
    console.log('result:', JSON.stringify(out, null, 2));
  }catch(e){
    console.error('error:', e.stack || e);
  }
})();
