import { componentSpec } from '../src/index.js';

const cases = [
    {
        name: 'Chase - Costco purchase',
        sms: 'Prime Visa: You made a $75.96 transaction with COSTCO WHSE #1696 on Nov 12, 2025 at 7:40 PM ET.',
        expect: { count: 1, payee: 'Costco', amount: '75.96', paymentMethod: 'Chase Card', shared: false }
    },
    {
        name: 'Chase - online/phone/mail variant',
        sms: 'Prime Visa: You made an online, phone, or mail transaction of $75.99 with Amazon.com on Nov 12, 2025 at 7:53 PM ET.',
        expect: { count: 0}
    },
    {
        name: 'Citi - in-person transaction',
        sms: 'Citi Alert: A $43.38 transaction was made at CAMP ABBOT ACE HARDW on card ending in 0569. View details at citi.com/citimobileapp',
        expect: { count: 1, payee: 'Ace Hardware', amount: '43.38', paymentMethod: 'Citibank Card', business: true, shared: false }
    },
    {
        name: 'Citi - card-not-present (online)',
        sms: 'Citi Alert: Card ending in 0569 was not present for a $101.54 transaction at THE HOME DEP. View at citi.com/citimobileapp',
        expect: { count: 1, payee: 'Home Depot', amount: '101.54', paymentMethod: 'Citibank Card', shared: false }
    },
    {
        name: 'First Tech - multi transactions',
        sms: 'Transaction Alert from First Tech Federal Credit Union.\n***5267 had a transaction of ($131.15). Description: ACH Debit PORTLAND GENERAL BILLPAY - BILLPAY . Date: Nov 04, 2025 ***5267 had a transaction of ($50.00). Description: ACH Debit VESTWELL  - ACH TRAN . Date: Nov 04, 2025 ***5267 had a transaction of ($50.00). Description: ACH Debit VESTWELL  - ACH TRAN . Date: Nov 04, 2025 ',
        expect: {
            count: 3,
            payees: ['Pge', 'Sumday', 'Sumday'],
            shared: [true, false, false]  // PGE is shared, Sumday is not
        }
    },
    {
        name: 'Capital One - charge/hold (Savor Card)',
        sms: 'Capital One: A chrge or hold for $20.00 on November 16, 2025 was placed on your Savor Credit Card (8385) at ANDALE ANDALE. Std carrier chrges apply',
        expect: { count: 1, payee: 'Andale Andale', amount: '20.00', paymentMethod: 'Savor Card', shared: false }
    },
    {
        name: 'First Tech - Mixed credit card payment and legit transaction',
        sms: 'Transaction Alert from First Tech Federal Credit Union.\n' +
            '***5267 had a transaction of ($116.45). Description: ACH Debit  OF HILLSBORO UTILITIES - UTILITIES . Date: Nov 12, 2025 ***5267 had a transaction of ($96.43). Description: ACH Debit CHASE CREDIT CRD  - EPAY . Date: Nov 12, 2025',
        expect: { count: 1, payee: 'City Of Hillsboro', amount: '116.45', paymentMethod: 'Debit Card', shared: true }
    },
    {
        name: 'First Tech - City of Hillsboro Utilities',
        sms: 'Transaction Alert from First Tech Federal Credit Union.\n' +
            '***5267 had a transaction of ($105.01). Description: ACH Debit CITY OF HILLSBOR UTILITIES - UTILITIES . Date: Dec 12, 2025',
        expect: { count: 1, payee: 'City Of Hillsboro', amount: '105.01', paymentMethod: 'Debit Card', shared: true }
    },
    {
        name: 'First Tech - Tesla Supercharger (not shared)',
        sms: 'Transaction Alert from First Tech Federal Credit Union.\n***5267 had a transaction of ($48.50). Description: TESLA SUPERCHARGER WALMART . Date: Nov 21, 2025',
        expect: { count: 1, payee: 'Tesla Supercharger', amount: '48.50', paymentMethod: 'Debit Card', business: false, shared: false }
    },
    {
        name: 'First Tech - Netflix (business, not shared)',
        sms: 'Transaction Alert from First Tech Federal Credit Union.\n***5267 had a transaction of ($15.99). Description: ACH Debit NETFLIX.COM NETFLIX.COM CA. Date: Nov 20, 2025',
        expect: { count: 1, payee: 'Netflix', amount: '15.99', paymentMethod: 'Debit Card', business: true, shared: false }
    },
    {
        name: 'First Tech - Venmo cleaning (business, not shared)',
        sms: 'Transaction Alert from First Tech Federal Credit Union.\n***5267 had a transaction of ($120.00). Description: VENMO PAYMENT . Date: Nov 18, 2025',
        expect: { count: 1, payee: 'Zully Ponce', amount: '120.00', paymentMethod: 'Venmo', business: true, shared: false }
    },
    // All your ignore cases remain unchanged
    { name: 'Capital One - payment scheduled (ignore)', sms: 'Capital One Alert: Your payment of $28.54 is scheduled...', expect: { count: 0 } },
    { name: 'Capital One - payment confirmed (ignore)', sms: 'Capital One Alert: You paid $28.54 to your Savor...', expect: { count: 0 } },
    { name: 'First Tech - multi transaction credit card payments', sms: 'Transaction Alert... CHASE CREDIT CRD... CITI CARD ONLINE...', expect: { count: 0 } },
    { name: 'First Tech - Chase payment (ignore)', sms: 'Transaction Alert... CHASE CREDIT CRD...', expect: { count: 0 } },
    { name: 'First Tech - Citi payment (ignore)', sms: 'Transaction Alert... CITI CARD ONLINE...', expect: { count: 0 } },
    { name: 'First Tech - Capital One payment (ignore)', sms: 'Transaction Alert... CAPITAL ONE...', expect: { count: 0 } },
    { name: 'First Tech - Debit Card Purchase Alert (duplicate - ignore)', sms: 'Debit Card Purchase Alert...', expect: { count: 0 } }
];

describe('src/index.js parser - data-driven cases', () => {
    for (const c of cases) {
        test(c.name, async () => {
            const steps = { trigger: { event: { body: { text: c.sms } } } };
            const exported = {};
            const $ = {
                export: (k, v) => { exported[k] = v; }
            };

            const result = await componentSpec.run({ steps, $ });

            expect(Array.isArray(result)).toBe(true);
            expect(result.length).toBe(c.expect.count);

            if (c.expect.count === 0) return;

            // Single row checks
            if (!c.expect.payees) {
                const row = result[0];
                if (c.expect.payee) expect(row[1]).toBe(c.expect.payee);
                if (c.expect.amount) expect(row[4]).toBe(c.expect.amount);
                if (c.expect.paymentMethod) expect(row[5]).toBe(c.expect.paymentMethod);
                if (c.expect.shared !== undefined) expect(row[7]).toBe(c.expect.shared);
                if (c.expect.business !== undefined) expect(row[6]).toBe(c.expect.business);
            }
            // Multiple rows
            else {
                const gotPayees = result.map(r => r[1]);
                expect(gotPayees).toEqual(c.expect.payees);

                if (c.expect.shared) {
                    const sharedValues = result.map(r => r[7]);
                    expect(sharedValues).toEqual(c.expect.shared);
                }
            }
        });
    }
});