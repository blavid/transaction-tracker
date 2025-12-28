import { componentSpec } from '../src/index.js';

// Data-driven tests: for stability we check counts and that amounts/payee substrings are present.
const cases = [
    {
        name: 'Chase - Costco purchase',
        sms: 'Prime Visa: You made a $75.96 transaction with COSTCO WHSE #1696 on Nov 12, 2025 at 7:40 PM ET.',
        expect: { count: 1, payeeSub: 'COSTCO', amount: '75.96', paymentMethod: 'Chase Card' }
    },
    {
        name: 'Chase - online/phone/mail variant',
        sms: 'Prime Visa: You made an online, phone, or mail transaction of $75.99 with Amazon.com on Nov 12, 2025 at 7:53 PM ET.',
        expect: { count: 1, payeeSub: 'Amazon', amount: '75.99', paymentMethod: 'Chase Card' }
    },
    {
        name: 'Citi - in-person transaction',
        sms: 'Citi Alert: A $43.38 transaction was made at CAMP ABBOT ACE HARDW on card ending in 0569. View details at citi.com/citimobileapp',
        expect: { count: 1, payeeSub: 'ACE', amount: '43.38', paymentMethod: 'Citibank Card' }
    },
    {
        name: 'Citi - card-not-present (online)',
        sms: 'Citi Alert: Card ending in 0569 was not present for a $101.54 transaction at THE HOME DEP. View at citi.com/citimobileapp',
        expect: { count: 1, payeeSub: 'HOME DEP', amount: '101.54', paymentMethod: 'Citibank Card' }
    },
    {
        name: 'First Tech - multi transactions',
        sms: 'Transaction Alert from First Tech Federal Credit Union.\n***5267 had a transaction of ($131.15). Description: ACH Debit PORTLAND GENERAL BILLPAY - BILLPAY . Date: Nov 04, 2025 ***5267 had a transaction of ($50.00). Description: ACH Debit VESTWELL  - ACH TRAN . Date: Nov 04, 2025 ***5267 had a transaction of ($50.00). Description: ACH Debit VESTWELL  - ACH TRAN . Date: Nov 04, 2025 ',
        expect: { count: 3 }
    },
    {
        name: 'Capital One - charge/hold (Savor Card)',
        sms: 'Capital One: A chrge or hold for $20.00 on November 16, 2025 was placed on your Savor Credit Card (8385) at ANDALE ANDALE. Std carrier chrges apply',
        expect: { count: 1, payeeSub: 'ANDALE', amount: '20.00', paymentMethod: 'Savor Card' }
    },
    {
        name: 'First Tech - Mixed credit card payment and legit transaction',
        sms: 'Transaction Alert from First Tech Federal Credit Union.\n' +
            '***5267 had a transaction of ($116.45). Description: ACH Debit  OF HILLSBORO UTILITIES - UTILITIES . Date: Nov 12, 2025 ***5267 had a transaction of ($96.43). Description: ACH Debit CHASE CREDIT CRD  - EPAY . Date: Nov 12, 2025',
        expect: { count: 1, payeeSub: 'HILLSBORO', amount: '116.45' }
    },
    {
        name: 'First Tech - City of Hillsboro Utilities',
        sms: 'Transaction Alert from First Tech Federal Credit Union.\n' +
            '***5267 had a transaction of ($105.01). Description: ACH Debit CITY OF HILLSBOR UTILITIES - UTILITIES . Date: Dec 12, 2025',
        expect: { count: 1, payeeSub: 'HILLSBOR', amount: '105.01' }
    },
    {
        name: 'First Tech - Tesla Supercharger (not shared)',
        sms: 'Transaction Alert from First Tech Federal Credit Union.\n***5267 had a transaction of ($48.50). Description: TESLA SUPERCHARGER WALMART . Date: Nov 21, 2025',
        expect: { count: 1, payeeSub: 'TESLA', amount: '48.50' }
    },
    {
        name: 'First Tech - Netflix (business, not shared)',
        sms: 'Transaction Alert from First Tech Federal Credit Union.\n***5267 had a transaction of ($15.99). Description: ACH Debit NETFLIX.COM NETFLIX.COM CA. Date: Nov 20, 2025',
        expect: { count: 1, payeeSub: 'NETFLIX', amount: '15.99' }
    }
];

describe('src/index.js parser - data-driven cases', () => {
    for (const c of cases) {
        test(c.name, async () => {
            const steps = { trigger: { event: { body: { text: c.sms } } } };
            const exported = {};
            const $ = { export: (k, v) => { exported[k] = v; } };

            const result = await componentSpec.run({ steps, $ });

            // Support two return shapes: array of rows OR an object of named exports -> arrays.
            let rows;
            if (Array.isArray(result)) {
                rows = result;
            } else if (result && typeof result === 'object') {
                // pick the first array value in the exported object
                const vals = Object.values(result).filter(v => Array.isArray(v));
                rows = vals.length ? vals[0] : [];
            } else {
                rows = [];
            }

            expect(Array.isArray(rows)).toBe(true);
            expect(rows.length).toBe(c.expect.count);

            if (c.expect.count > 0) {
                const row = rows[0];
                // If a payee substring is provided, check the first row's payee contains it (case-insensitive)
                if (c.expect.payeeSub) {
                    expect(row[1].toUpperCase()).toContain(c.expect.payeeSub.toUpperCase());
                }
                if (c.expect.amount) {
                    expect(row[4]).toBe(c.expect.amount);
                }
                if (c.expect.paymentMethod) {
                    expect(row[5]).toBe(c.expect.paymentMethod);
                }
            }
        });
    }
});
