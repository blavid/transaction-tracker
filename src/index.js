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

         // Fetch payee map from GitHub (cached automatically by Pipedream)
         const response = await fetch('https://raw.githubusercontent.com/blavid/transaction-tracker/refs/heads/separate-payee-rules/src/payees.json');
         const PAYEE_RULES = await response.json();
         // Convert string regexes → real RegExp objects
         const PAYEES = PAYEE_RULES.map(p => ({
            r: new RegExp(p.regex, 'i'),
            n: p.name,
            c: p.category,
            b: p.business,
            s: p.shared,
            d: p.desc || ''
         }));

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
            // EARLY EXIT: Ignore the redundant "online, phone, or mail" Chase message
            if (sms.includes('Prime Visa: You made an online, phone, or mail transaction of')) {
                return []; // silently drop this variant — we only want the clean one
            }
            const patterns = [
                { r:/Prime Visa.*?\$([0-9,.]+).*?with (.+?) on/,                 meth:'Chase Card' },
                { r:/Capital One.*?\$([0-9,.]+).*?at (.+?)\./,                  meth:'Savor Card' },
                { r:/Citi Alert.*?\$([0-9,.]+).*?at\s+(.+?)\s+on card\s+(?:ending in|last 4 digits)?\s*\d{4}/i, meth:'Citibank Card' },
                { r:/Citi Alert.*?\$([0-9,.]+).*?at\s+(.+?)\.\s*(?:View|citi|$)/i, meth:'Citibank Card' }
            ];

            for (const { r, meth } of patterns) {
                const m = sms.match(r);
                if (!m) continue;

                const amount = m[1].replace(/,/g,'');
                const rawPayee = m[2].trim();
                if (isExcluded(rawPayee)) break;

                const { payee, cat, biz, shared, desc } = enrich(rawPayee);
                const date = new Date().toLocaleDateString('en-US', { month:'2-digit', day:'2-digit', year:'numeric' });

                // ── DEDUPLICATION: Chase sends two identical alerts for online purchases ──
                const dedupKey = `${amount}|${payee}|${date}|${meth}`;
                if (transactions.some(t => t.dedupKey === dedupKey)) {
                    break; // duplicate → skip silently
                }

                transactions.push({
                    date, payee, amount, paymentMethod: meth,
                    category: cat, business: biz, shared, description: desc,
                    dedupKey  // temporary field — automatically stripped in output
                });
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