const componentSpec = {
    async run({ steps, $ }) {
        // ── Extract clean SMS text ─────────────────────
        let sms = steps.trigger.event.body?.text || '';
        if (!sms && steps.trigger.event.body?.html) {
            const { parse } = await import('node-html-parser');
            const root = parse(steps.trigger.event.body.html);
            const body = root.querySelector('body');
            sms = body ? body.textContent.trim() : '';
            sms = sms.replace(/\s+/g, ' ').trim();
        }
        if (!sms) return [];

        const transactions = [];

        // ── PAYEES — now with optional "shared" boolean ─────────────────────
        const PAYEES = [
            { r:/MICROSOFT\*XB/i,                  n:'Microsoft',               c:'Entertainment',       b:false, s:false, d:'Microsoft Xbox Game Pass' },
            { r:/AMAZON\.COM|AMZN\s+MKTP/i,        n:'Amazon',                  c:'Household Items - H', b:false, s:false,  d:'Online shopping' },
            { r:/WINCO\s+FOODS/i,                  n:'Winco',                   c:'Groceries',           b:false, s:false },
            { r:/COSTCO\s+WHSE/i,                  n:'Costco',                  c:'Groceries',           b:false, s:false },
            { r:/SAFEWAY/i,                        n:'Safeway',                 c:'Groceries',           b:false, s:false },
            { r:/HOME\s+DEP/i,                     n:'Home Depot',              c:'Household Items - H', b:false, s:false },
            { r:/TESLA\s+SUBSCR/i,                 n:'Tesla',                   c:'Auto Maint',          b:false, s:false, d:'FSD or Premium Connectivity' },
            { r:/CAMP\s+ABBOT\s+ACE/i,             n:'Ace Hardware',            c:'Household Items - SR',b:true,  s:false },
            { r:/PORTLAND\s+GENERAL/i,             n:'Pge',                     c:'Utilities - H',       b:false, s:true,  d:'Electrical Service' },
            { r:/HILLSBORO\s+UTILITIES/i,          n:'City Of Hillsboro',       c:'Utilities - H',       b:false, s:true },
            { r:/CASCADE\s+NATURAL/i,              n:'Cascade Natural Gas',     c:'Utilities- SR',       b:true,  s:false },
            { r:/HOST\s+TOOLS/i,                   n:'Host Tools',              c:'Misc Svcs - SR',      b:true,  s:false },
            { r:/SUNRIVER\s+ENVIRON/i,             n:'Sunriver Environmental',  c:'Utilities - SR',      b:true,  s:false },
            { r:/STARLINK\s+HAS/i,                 n:'Starlink',                c:'Utilities- H',        b:false, s:true },
            { r:/SANTANDER/i,                      n:'Santander Bank',          c:'Auto Payments',       b:false, s:false, d:'Car payment for Carmen' },
            { r:/BANK\s+OF\s+AMERICA/i,            n:'Bank of America',         c:'Auto Payments',       b:false, s:true, d:'RV payment for Thad' },
            { r:/ORACLE/i,                         n:'Oracle COBRA',            c:'Healthcare',          b:false, s:true },
            { r:/VESTWELL/i,                       n:'Sumday',                  c:'Charity',             b:false, s:false },
            { r:/SUNRIVER\s+OWNERS/i,              n:'Sunriver HOA',            c:'HOA Dues - SR',       b:true,  s:false },
            { r:/SQ\s*\*\s*THREE\s+RI/i,           n:'Three Rivers Pool and Spa',c:'Misc Svcs - SR',    b:true,  s:false },
            { r:/WORLDMARK/i,                      n:'Worldmark The Club',      c:'Travel',              b:false, s:true },
            { r:/TESLA\s+SUPERC/i,                 n:'Tesla Supercharger',      c:'Auto Maint',          b:false,  s:false },
            { r:/HILLSBORO\s+GA/i,                 n:'Hillsboro Garbage',       c:'Utilities- H',        b:false, s:true },
            { r:/NW\s+NATURAL/i,                   n:'NW Natural',              c:'Utilities- H',        b:false, s:true },
            { r:/MIDSTATE\s+ELE/i,                 n:'Midstate Electric',       c:'Utilities - SR',      b:true,  s:false },
            { r:/NETFLIX/i,                        n:'Netflix',                 c:'Utilities - SR',      b:true,  s:false },
            { r:/VENMO/i,                          n:'Zully Ponce',             c:'Cleaning Svcs - SR',  b:true,  s:false },
            { r:/.*/,                              n:null,                      c:'Other',               b:false, s:false, d:'Manual Review Required' }
        ];

        const enrich = (raw) => {
            const cleaned = raw.trim();
            const rule = PAYEES.find(p => p.r.test(cleaned));
            if (!rule?.n) {
                return {
                    payee: toTitleCase(cleaned),
                    cat: 'Other',
                    biz: false,
                    shared: false,
                    desc: 'Manual Review Required'
                };
            }
            return {
                payee: rule.n,
                cat: rule.c,
                biz: rule.b,
                shared: rule.s ?? false,
                desc: rule.d || ''
            };
        };

        const toTitleCase = s => s ? s.toLowerCase().replace(/\b\w/g, c => c.toUpperCase()) : s;

        const excluded = ['CITI CARD ONLINE','CHASE CREDIT CRD','CAPITAL ONE','OVERDRAFT PROTECTION ADVANCE']
            .map(s => s.toUpperCase());

        const isExcluded = str => excluded.some(e => str.toUpperCase().includes(e));

        // ── FIRST TECH ─────────────────────────────────────
        if (sms.includes('Transaction Alert from First Tech Federal Credit Union')) {
            for (const block of sms.split('***').slice(1)) {
                const m = block.match(/had a transaction of \(\$([0-9,]+\.\d{2})\)\.\s*Description:\s*(.*?)\s+Date:\s*([A-Za-z]+)\s+(\d{1,2}),\s*(\d{4})/i);
                if (!m) continue;

                let payee = m[2]
                    .replace(/\s*\.$/, '')
                    .replace(/^ACH\s+Debit\s+/i, '')
                    .replace(/\s*-.*BILL.?PAYMT.*$/i, '')
                    .replace(/\s*-.*PAYMT.*$/i, '')
                    .replace(/\s+FIRST TECH FCU.*$/i, '')
                    .trim();

                if (isExcluded(payee)) continue;

                const { payee: p, cat, biz, shared, desc } = enrich(payee);
                const monthMap = {Jan:'01',Feb:'02',Mar:'03',Apr:'04',May:'05',Jun:'06',Jul:'07',Aug:'08',Sep:'09',Oct:'10',Nov:'11',Dec:'12'};
                const date = `${monthMap[m[3]]}/${m[4].padStart(2,'0')}/${m[5]}`;

                transactions.push({
                    date, payee: p, amount: m[1].replace(/,/g,''),
                    paymentMethod: payee.toUpperCase().includes('VENMO') ? 'Venmo' : 'Debit Card',
                    category: cat, business: biz, shared, description: desc
                });
            }
        }

        // ── ALL OTHER CARDS ─────────────────────────────────────
        else {
            const patterns = [
                { r:/Prime Visa.*?\$([0-9,.]+).*?with (.+?) on/,                 meth:'Chase Card' },
                { r:/Capital One.*?\$([0-9,.]+).*?at (.+?)\./,                  meth:'Savor Card' },
                { r:/Citi Alert.*?\$([0-9,.]+).*?at\s+(.+?)\.\s*(View|citi|$)/i,meth:'Citibank Card' },
                { r:/Citi Alert.*?\$([0-9,.]+).*?at\s+([^.]+) on card/i,        meth:'Citibank Card' }
            ];

            for (const { r, meth } of patterns) {
                const m = sms.match(r);
                if (!m) continue;

                const amount = m[1].replace(/,/g,'');
                const rawPayee = m[2].trim();
                if (isExcluded(rawPayee)) break;

                const { payee, cat, biz, shared, desc } = enrich(rawPayee);
                const date = new Date().toLocaleDateString('en-US', { month:'2-digit', day:'2-digit', year:'numeric' });

                transactions.push({ date, payee, amount, paymentMethod: meth,
                    category: cat, business: biz, shared, description: desc });
                break;
            }
        }

        // ── OUTPUT — now with Shared Expense column ─────────────────────
        const rows = transactions.map(t => [
            t.date,
            t.payee,
            t.description || '',
            t.category || '',
            t.amount,
            t.paymentMethod,
            !!t.business,     // Business Expense → TRUE/FALSE
            !!t.shared,       // Shared Expense  → TRUE/FALSE
            '',               // Italy Expense
            ''                // Shed
        ]);

        $.export('transactions', rows);
        return rows;
    }
};

// ── EXACT EXPORTS YOUR TESTS EXPECT ─────
const maybeWrapped = typeof defineComponent !== 'undefined' ? defineComponent(componentSpec) : componentSpec;
export default maybeWrapped;
export { componentSpec };