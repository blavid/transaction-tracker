import { readFile } from 'fs/promises';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const filePath = join(__dirname, 'payees.json');

const componentSpec = {
    async run({ steps, $ }) {
        let sms = steps.trigger.event.body?.text || '';
        if (!sms && steps.trigger.event.body?.html) {
            const { parse } = await import('node-html-parser');
            const root = parse(steps.trigger.event.body.html);
            const body = root.querySelector('body');
            sms = body ? body.textContent.trim() : '';
            sms = sms.replace(/\s+/g, ' ').trim();
        }
        if (!sms) return { my_transactions: [], wife_transactions: [] };

        const myTransactions = [];
        const wifeTransactions = [];

        // ── Load payees.json ─────────────────────
        let PAYEE_DATA;
        try {
            const localData = await readFile(filePath, 'utf8');
            PAYEE_DATA = JSON.parse(localData);
        } catch (err) {
            const response = await fetch('https://raw.githubusercontent.com/blavid/transaction-tracker/main/src/payees.json');
            if (!response.ok) throw new Error(`Failed to fetch payees.json: ${response.status}`);
            PAYEE_DATA = await response.json();
        }

        const PAYEES = PAYEE_DATA.map(p => ({
            r: new RegExp(p.regex, 'i'),
            n: p.name,
            c: p.category,
            b: p.business ?? false,
            s: p.shared ?? false,
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

        // ── ACCOUNT DETECTION ─────────────────────
        const isMyFirstTech = /\*\*\*5267/.test(sms);
        const isWifeFirstTech = /\*\*\*9086/.test(sms);
        const isMyCiti = /ending in 0569/.test(sms);
        const isWifeCiti = /ending in 1047/.test(sms);

        // ── FIRST TECH ─────────────────────────────────────
        if (sms.includes('Transaction Alert from First Tech Federal Credit Union')) {
            const target = isMyFirstTech ? myTransactions : isWifeFirstTech ? wifeTransactions : myTransactions;

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

                target.push({
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

                const target = (meth === 'Citibank Card' && isWifeCiti) ? wifeTransactions :
                               (meth === 'Citibank Card' && isMyCiti) ? myTransactions : myTransactions;

                target.push({
                    date, payee, amount, paymentMethod: meth,
                    category: cat, business: biz, shared, description: desc
                });
                break;
            }
        }

        // ── FORMAT ROWS ─────────────────────
        const formatRows = (txns) => txns.map(t => [
            t.date,
            t.payee,
            t.description || '',
            t.category || '',
            t.amount,
            t.paymentMethod,
            !!t.business,
            !!t.shared,
            '',
            ''
        ]);

        const myRows = formatRows(myTransactions);
        const wifeRows = formatRows(wifeTransactions);

        $.export('my_transactions', myRows);
        $.export('wife_transactions', wifeRows);

        return { my_transactions: myRows, wife_transactions: wifeRows };
    }
};

const maybeWrapped = typeof defineComponent !== 'undefined' ? defineComponent(componentSpec) : componentSpec;
export default maybeWrapped;
export { componentSpec };