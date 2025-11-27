const componentSpec = {
    async run({steps, $}) {
        let smsText = steps.trigger.event.body.text;
        if (!smsText && steps.trigger.event.body.html) {
            const {parse} = await import('node-html-parser');
            const root = parse(steps.trigger.event.body.html);
            const body = root.querySelector('body');
            smsText = body ? body.textContent.trim() : '';
            smsText = smsText.replace(/\s+/g, ' ').trim();
        }
        if (!smsText) throw new Error('No SMS text found');

        if (smsText.includes('Debit Card Purchase Alert from First Tech Federal Credit Union')) {
            $.export('transactions', []);
            return [];
        }

        let transactions = [];

        // === PAYEE MAPPING (friendly + metadata) ===
        const PAYEE_MAP = {
            'AMAZON.COM':              { name: 'Amazon',               category: 'Shopping',       business: false, desc: 'Online shopping' },
            'AMZN MKTP':               { name: 'Amazon',               category: 'Shopping',       business: false, desc: 'Amazon Marketplace' },
            'PORTLAND GENERAL':        { name: 'Pge',                  category: 'Utilities',      business: false, desc: 'Electricity' },
            'OF HILLSBORO UTILITIES':  { name: 'City of Hillsboro',      category: 'Utilities',      business: false, desc: 'Water & Sewer' },
            'CASCADE NATURAL':         { name: 'Cascade Natural Gas',  category: 'Utilities',      business: false, desc: 'Gas' },
            'WINCO FOODS':             { name: 'Winco',                category: 'Groceries',      business: false },
            'COSTCO WHSE':             { name: 'Costco',               category: 'Groceries',      business: false },
            'SAFEWAY':                 { name: 'Safeway',              category: 'Groceries',      business: false },
            'CAMP ABBOT ACE HARDW':    { name: 'Camp Abbot Ace Hardware', category: 'Home', business: false },
            'THE HOME DEP':            { name: 'Home Dep',            category: 'Home',           business: false },
            'ANDALE ANDALE':           { name: 'Andale Andale',        category: 'Dining',         business: false },
            '__DEFAULT__':             { name: null, category: 'Other', business: false, desc: 'Manual Review Required' }
        };

        const toTitleCase = str => str
            ? str.toLowerCase().replace(/\b\w/g, c => c.toUpperCase()).replace(/#(\d+)/g, '#$1')
            : str;

        function enrichPayee(raw) {
            if (!raw) return { final: 'Unknown', cat: 'Other', biz: false, desc: '' };
            const norm = raw.toUpperCase().replace(/\s+/g, ' ').trim();
            let map = PAYEE_MAP[norm];
            if (!map) {
                const found = Object.entries(PAYEE_MAP).find(([k]) => norm.includes(k) || k.includes(norm));
                map = found ? found[1] : PAYEE_MAP['__DEFAULT__'];
            }
            return {
                final: map.name ? toTitleCase(map.name) : toTitleCase(raw),
                cat: map.category || 'Other',
                biz: map.business,
                desc: map.desc || ''
            };
        }

        const excludedPayees = [
            'CITI CARD ONLINE - PAYMENT','CHASE CREDIT CRD - EPAY','CAPITAL ONE - MOBILE PMT',
            'ACH Debit CITI CARD ONLINE - PAYMENT','ACH Debit CHASE CREDIT CRD - EPAY','ACH Debit CAPITAL ONE - MOBILE PMT'
        ].map(s => s.toUpperCase());

        const patterns = [
            { r: /Prime Visa: You made(?: an online[^$]*?)? \$(\d+\.\d{2}).*?with (.+?) on/, m: m=>({a:m[1],p:m[2]}), meth:'Chase Card' },
            { r: /Prime Visa: You made a \$(\d+\.\d{2}) transaction with (.+?) on/, m: m=>({a:m[1],p:m[2]}), meth:'Chase Card' },
            { r: /Prime Visa: You have a \$(\d+\.\d{2}) pending credit from (.+?)\./, m: m=>({a:`-${m[1]}`,p:m[2]}), meth:'Chase Card' },
            { r: /Capital One: A chrge or hold for \$(\d+\.\d{2}).* at (.+?)\./, m: m=>({a:m[1],p:m[2]}), meth:'Savor Card' },
            { r: /Capital One Alert: Your payment of/, m:()=>null, meth:'Savor Card' },
            { r: /Capital One Alert: You paid/, m:()=>null, meth:'Savor Card' },
            { r: /Citi Alert: Card ending in \d{4} was not present for a \$(\d+\.\d{2}).*?at\s+(.+?)\.\s*(View|citi|$)/i, m: m=>({a:m[1],p:m[2].trim().replace(/\s+/g,' ')}), meth:'Citibank Card' },
            { r: /Citi Alert: A \$(\d+\.\d{2}) transaction was made at\s+([^.]+?)\s+on card ending in \d{4}/i, m: m=>({a:m[1],p:m[2].trim().replace(/\s+/g,' ')}), meth:'Citibank Card' },
            { r: /Debit Card Purchase Alert.*TRAN AMT: \$(\d+\.\d{2}).*TRAN DESC:.*?(.+?)\s+AVAIL BAL:/, m: m=>({a:m[1],p:m[2].trim()}), meth:'Debit Card' }
        ].map(o => ({regex: o.r, paymentMethod: o.meth, extract: o.m}));

        let matched = false;

        if (smsText.includes('Transaction Alert from First Tech Federal Credit Union')) {
            const blocks = smsText.split('***').slice(1);
            for (const b of blocks) {
                const m = b.match(/had a transaction of \(\$(\d+(?:\.\d+)?)\)\. Description: (.*?)\s+Date:\s*([A-Za-z]+)\s+(\d{1,2}),\s*(\d{4})/s);
                if (!m) continue;
                let payee = m[2].replace(/\s*\.$/, '').replace(/^ACH\s+Debit\s+/i, '').trim();
                const norm = payee.toUpperCase().replace(/\s+/g,' ').trim();
                if (excludedPayees.some(e => norm.includes(e))) continue;

                const monthMap = {Jan:'01',Feb:'02',Mar:'03',Apr:'04',May:'05',Jun:'06',Jul:'07',Aug:'08',Sep:'09',Oct:'10',Nov:'11',Dec:'12'};
                const date = `${monthMap[m[3]]||'01'}/${m[4].padStart(2,'0')}/${m[5]}`;
                const method = norm.includes('VENMO') ? 'Venmo' : 'Debit Card';
                const e = enrichPayee(payee);

                transactions.push({date, payee: e.final, amount: m[1], paymentMethod: method,
                    category: e.cat, business: e.biz?'Yes':'No', description: e.desc});
            }
        } else {
            for (const p of patterns) {
                const m = smsText.match(p.regex);
                if (!m) continue;
                matched = true;
                const ex = p.extract(m);
                if (ex === null) break;
                const raw = ex.p.trim();
                const norm = raw.toUpperCase().replace(/\s+/g,' ').trim();
                if (excludedPayees.some(e => norm.includes(e))) break;

                const e = enrichPayee(raw);
                const date = new Date().toLocaleDateString('en-US', {month:'2-digit',day:'2-digit',year:'numeric'});

                transactions.push({date, payee: e.final, amount: ex.a, paymentMethod: p.paymentMethod,
                    category: e.cat, business: e.biz?'Yes':'No', description: e.desc});
                break;
            }

            if (!matched && transactions.length === 0) {
                const amount = smsText.match(/\$(\d+\.\d{2})/)?.[1] || 'Unknown';
                const e = enrichPayee('Manual Review Required');
                const date = new Date().toLocaleDateString('en-US', {month:'2-digit',day:'2-digit',year:'numeric'});
                transactions.push({date, payee: e.final, amount, paymentMethod: 'Unknown',
                    category: e.cat, business: 'No', description: e.desc});
            }
        }

        // OLD COLUMN LAYOUT (so your existing tests pass)
        // [Date, Payee, "", "", Amount, Method, Category, Business, Description]
        $.export('transactions', transactions.map(t => [
            t.date,
            t.payee,
            "",           // old column C (blank)
            "",           // old column D (blank)
            t.amount,     // column E → amount still at index 4
            t.paymentMethod, // column F → method at index 5
            t.category,      // new column G
            t.business,      // new column H
            t.description    // new column I
        ]));

        return transactions.map(t => [t.date, t.payee, "", "", t.amount, t.paymentMethod, t.category, t.business, t.description]);
    }
};

const maybeWrapped = typeof defineComponent !== 'undefined' ? defineComponent(componentSpec) : componentSpec;
export default maybeWrapped;
export {componentSpec};