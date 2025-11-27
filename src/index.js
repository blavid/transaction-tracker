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

        const log = (msg, data) => {
            console.log(`${msg}`, data ? JSON.stringify(data, null, 2) : '');
        };

        // === PAYEE MAPPING (friendly + metadata) ===
// === FINAL ROBUST PAYEE MAPPING WITH REGEX ===
        const PAYEE_MAP = [
            { regex: /MICROSOFT\*XB/i,                    name: 'Microsoft',           category: 'Entertainment',       business: false, desc: 'Microsoft Xbox Game Pass' },
            { regex: /AMAZON\.COM|AMZN\s+MKTP/i,          name: 'Amazon',              category: 'Household Items - H', business: false, desc: 'Online shopping' },
            { regex: /WINCO\s+FOODS/i,                    name: 'Winco',               category: 'Groceries',           business: false, desc: 'Groceries' },
            { regex: /COSTCO\s+WHSE/i,                    name: 'Costco',              category: 'Groceries',           business: false, desc: 'Groceries' },
            { regex: /SAFEWAY/i,                          name: 'Safeway',             category: 'Groceries',           business: false, desc: 'Groceries' },
            { regex: /HOME\s+DEP/i,                       name: 'Home Depot',          category: 'Household Items - H', business: false },
            { regex: /TESLA\s+SUBSCR/i,                   name: 'Tesla',               category: 'Auto Maint',          business: false, desc: 'FSD or Premium Connectivity' },
            { regex: /CAMP\s+ABBOT\s+ACE/i,               name: 'Ace Hardware',        category: 'Household Items - SR', business: true },
            { regex: /PORTLAND\s+GENERAL/i,               name: 'Pge',                 category: 'Utilities - H',       business: false, desc: 'Electrical Service' },
            { regex: /HILLSBORO\s+UTILITIES/i,            name: 'City Of Hillsboro',   category: 'Utilities - H',       business: false, desc: 'Water and sewer service' },
            { regex: /CASCADE\s+NATURAL/i,                name: 'Cascade Natural Gas', category: 'Utilities- SR',       business: true, desc: 'Natural Gas Service' },
            { regex: /HOST\s+TOOLS/i,                     name: 'Host Tools',          category: 'Misc Svcs - SR',      business: true, desc: 'Monthly Subscription' },
            { regex: /SUNRIVER\s+ENVIRON/i,               name: 'Sunriver Environmental', category: 'Utilities - SR',   business: true, desc: 'Water and sewer service' },
            { regex: /STARLINK\s+HAS/i,                   name: 'Starlink',            category: 'Utilities- H',        business: false, desc: 'Internet Service' },
            { regex: /SANTANDER/i,                        name: 'Santander Bank',      category: 'Auto Payments',       business: false, desc: 'Car payment for Carmen' },
            { regex: /BANK\s+OF\s+AMERICA/i,              name: 'Bank of America',     category: 'Auto Payments',       business: false, desc: 'RV payment for Thad' },
            { regex: /ORACLE/i,                           name: 'Oracle COBRA',        category: 'Healthcare',          business: false, desc: 'COBRA payment' },
            { regex: /VESTWELL/i,                         name: 'Sumday',              category: 'Charity',             business: false, desc: 'Contribution to 529 plan' },
            { regex: /SUNRIVER\s+OWNERS/i,                name: 'Sunriver HOA',        category: 'HOA Dues - SR',       business: true, desc: 'Homeowner Association dues' },
            { regex: /SQ\s*\*\s*THREE\s+RI/i,             name: 'Three Rivers Pool and Spa', category: 'Misc Svcs - SR', business: true, desc: 'Spa Service' },
            { regex: /WORLDMARK/i,                        name: 'Worldmark The Club',  category: 'Travel',              business: false, desc: 'Maintenance Dues' },
            { regex: /TESLA\s+SUPERC/i,                   name: 'Tesla Supercharger',  category: 'Auto Maint',          business: true, desc: 'Fuel for Carmen' },
            { regex: /HILLSBORO\s+GA/i,                   name: 'Hillsboro Garbage',   category: 'Utilities- H',        business: false, desc: 'Garbage service' },
            { regex: /NW\s+NATURAL/i,                     name: 'NW Natural',          category: 'Utilities- H',        business: false, desc: 'Natural Gas Service' },
            { regex: /MIDSTATE\s+ELE/i,                   name: 'Midstate Electric',   category: 'Utilities - SR',      business: true, desc: 'Electrical Service' },
            { regex: /NETFLIX/i,                          name: 'Netflix',             category: 'Utilities - SR',      business: true, desc: 'Monthly Subscription' },
            { regex: /VENMO/i,                            name: 'Zully Ponce',         category: 'Cleaning Svcs - SR',  business: true, desc: 'Cleaning for guest' },
            { regex: /.*/,                                name: null,                  category: 'Other',               business: false, desc: 'Manual Review Required' }
        ];

        function enrichPayee(rawPayee) {
            if (!rawPayee) return { final: 'Unknown', cat: 'Other', biz: false, desc: '' };
            const cleaned = rawPayee.trim();
            const rule = PAYEE_MAP.find(r => r.regex.test(cleaned));

            if (!rule || !rule.name) {
                return {
                    final: toTitleCase(cleaned),
                    cat: rule?.category || 'Other',
                    biz: false,
                    desc: rule?.desc || 'Manual Review Required'
                };
            }

            return {
                final: rule.name,
                cat: rule.category,
                biz: rule.business,
                desc: rule.desc || ''
            };
        }

        const toTitleCase = str => str
            ? str.toLowerCase().replace(/\b\w/g, c => c.toUpperCase()).replace(/#(\d+)/g, '#$1')
            : str;

        const excludedPayees = [
            'CITI CARD ONLINE - PAYMENT',
            'CHASE CREDIT CRD - EPAY',
            'CAPITAL ONE - MOBILE PMT',
            'ACH Debit CITI CARD ONLINE - PAYMENT',
            'ACH Debit CHASE CREDIT CRD - EPAY',
            'ACH Debit CAPITAL ONE - MOBILE PMT',
            'OVERDRAFT PROTECTION ADVANCE'
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
                const m = b.match(/had a transaction of \(\$([0-9,]+\.\d{2})\)\.\s*Description:\s*(.*?)\s+Date:\s*([A-Za-z]+)\s+(\d{1,2}),\s*(\d{4})/is);
                if (!m) {
                    log('No match for block:', b);
                    continue;
                }

                log('Raw description:', m[2]);
                let payee = m[2]
                    .replace(/\s*\.$/, '')                    // trailing " ."
                    .replace(/^ACH\s+Debit\s+/i, '')          // "ACH Debit "
                    .replace(/\s*-.*BILL.?PAYMT.*$/i, '')     // "- BILL PAYMT" garbage
                    .replace(/\s*-.*PAYMT.*$/i, '')           // any "- PAYMT"
                    .replace(/\s+FIRST TECH FCU.*$/i, '')     // remove your own credit union name
                    .trim();

                log('Cleaned payee:', `"${payee}"`);

                // let payee = m[2].replace(/\s*\.$/, '').replace(/^ACH\s+Debit\s+/i, '').trim();
                const norm = payee.toUpperCase().replace(/\s+/g,' ').trim();
                log('Norm for exclude check:', `"${norm}"`);

                if (excludedPayees.some(e => norm.includes(e))) {
                    log('SKIPPED by excludedPayees:', norm);
                    continue;
                }

                const monthMap = {Jan:'01',Feb:'02',Mar:'03',Apr:'04',May:'05',Jun:'06',Jul:'07',Aug:'08',Sep:'09',Oct:'10',Nov:'11',Dec:'12'};
                const date = `${monthMap[m[3]]||'01'}/${m[4].padStart(2,'0')}/${m[5]}`;
                const method = norm.includes('VENMO') ? 'Venmo' : 'Debit Card';
                const e = enrichPayee(payee);

                log('Enriched result:', e);

                log('Pushing transaction:', {date, payee: e.final, amount: m[1], business: !!e.biz});

                transactions.push({date, payee: e.final, amount: m[1], paymentMethod: method,
                    category: e.cat, business: !!e.biz, description: e.desc});
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
                    category: e.cat, business: !!e.biz, description: e.desc});
                break;
            }

            if (!matched && transactions.length === 0) {
                const amount = smsText.match(/\$(\d+\.\d{2})/)?.[1] || 'Unknown';
                const e = enrichPayee('Manual Review Required');
                const date = new Date().toLocaleDateString('en-US', {month:'2-digit',day:'2-digit',year:'numeric'});
                transactions.push({date, payee: e.final, amount, paymentMethod: 'Unknown',
                    category: e.cat, business: false, description: e.desc});
            }
        }

        // FINAL OUTPUT — PERFECT COLUMN ALIGNMENT WITH YOUR GOOGLE SHEET
        const outputRows = transactions.map(t => [
            t.date,
            t.payee,
            t.description || "",
            t.category || "",
            t.amount,
            t.paymentMethod,
            t.business === true ? true : false,
            "",                 // Shared Expense
            "",                 // Italy Expense
            ""                  // Shed
        ]);

        log('Final transactions array length:', transactions.length);
        log('Final output rows:', outputRows);

        $.export('transactions', outputRows);
        return outputRows;
    }
};

const maybeWrapped = typeof defineComponent !== 'undefined' ? defineComponent(componentSpec) : componentSpec;
export default maybeWrapped;
export {componentSpec};