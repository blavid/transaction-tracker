import {componentSpec} from '../src/index.js';

const cases = [
    {
        name: 'Chase - Costco purchase',
        sms: 'Prime Visa: You made a $75.96 transaction with COSTCO WHSE #1696 on Nov 12, 2025 at 7:40 PM ET.',
        expect: {count: 1, payee: 'Costco', amount: '75.96', paymentMethod: 'Chase Card'}
    },
    {
        name: 'Chase - online/phone/mail variant',
        sms: 'Prime Visa: You made an online, phone, or mail transaction of $75.99 with Amazon.com on Nov 12, 2025 at 7:53 PM ET.',
        expect: {count: 1, payee: 'Amazon', amount: '75.99', paymentMethod: 'Chase Card'}
    },
    {
        name: 'Citi - in-person transaction',
        sms: 'Citi Alert: A $43.38 transaction was made at CAMP ABBOT ACE HARDW on card ending in 0569. View details at citi.com/citimobileapp',
        expect: {count: 1, payee: 'Camp Abbot Ace Hardware', amount: '43.38', paymentMethod: 'Citibank Card'}
    },
    {
        name: 'Citi - card-not-present (online)',
        sms: 'Citi Alert: Card ending in 0569 was not present for a $101.54 transaction at THE HOME DEP. View at citi.com/citimobileapp',
        expect: {count: 1, payee: 'Home Dep', amount: '101.54', paymentMethod: 'Citibank Card'}
    },
    {
        name: 'First Tech - multi transactions',
        sms: 'Transaction Alert from First Tech Federal Credit Union.\n***5267 had a transaction of ($131.15). Description: ACH Debit PORTLAND GENERAL BILLPAY - BILLPAY . Date: Nov 04, 2025 ***5267 had a transaction of ($50.00). Description: ACH Debit VESTWELL  - ACH TRAN . Date: Nov 04, 2025 ***5267 had a transaction of ($50.00). Description: ACH Debit VESTWELL  - ACH TRAN . Date: Nov 04, 2025 ',
        expect: {
            count: 3,
            payees: ['Pge', 'Vestwell  - Ach Tran', 'Vestwell  - Ach Tran']
        }
    },
    {
        name: 'Capital One - charge/hold (Savor Card)',
        sms: 'Capital One: A chrge or hold for $20.00 on November 16, 2025 was placed on your Savor Credit Card (8385) at ANDALE ANDALE. Std carrier chrges apply',
        expect: {count: 1, payee: 'Andale Andale', amount: '20.00', paymentMethod: 'Savor Card'}
    },
    {
        name: 'Capital One - payment scheduled (ignore)',
        sms: 'Capital One Alert: Your payment of $28.54 is scheduled for November 10, 2025. Contact us if your payment details are incorrect. Std carrier charges apply',
        expect: {count: 0}
    },
    {
        name: 'Capital One - payment confirmed (ignore)',
        sms: 'Capital One Alert: You paid $28.54 to your Savor Credit Card…(8385) on November 10, 2025. Msg & data rates may apply.',
        expect: {count: 0}
    },
    {
        name: 'First Tech - multi transaction credit card payments',
        sms: 'Transaction Alert from First Tech Federal Credit Union.\n' +
            '***5267 had a transaction of ($500.00). Description: ACH Debit CITI CARD ONLINE  - PAYMENT . Date: Nov 17, 2025 ***5267 had a transaction of ($344.53). Description: ACH Debit CHASE CREDIT CRD  - EPAY . Date: Nov 17, 2025 ***5267 had a transaction of ($26.00). Description: ACH Debit CAPITAL ONE  - MOBILE PMT . Date: Nov 17, 2025 ',
        expect: {count: 0}
    },
    {
        name: 'First Tech - Chase payment (ignore)',
        sms: 'Transaction Alert from First Tech Federal Credit Union.\n***5267 had a transaction of ($344.53). Description: ACH Debit CHASE CREDIT CRD  - EPAY . Date: Nov 17, 2025 ',
        expect: {count: 0}
    },
    {
        name: 'First Tech - Citi payment (ignore)',
        sms: 'Transaction Alert from First Tech Federal Credit Union.\n***5267 had a transaction of ($500.00). Description: ACH Debit CITI CARD ONLINE  - PAYMENT . Date: Nov 17, 2025 ',
        expect: {count: 0}
    },
    {
        name: 'First Tech - Capital One payment (ignore)',
        sms: 'Transaction Alert from First Tech Federal Credit Union.\n***5267 had a transaction of ($26.00). Description: ACH Debit CAPITAL ONE  - MOBILE PMT . Date: Nov 17, 2025 ',
        expect: {count: 0}
    },
    {
        name: 'First Tech - Mixed credit card payment and legit transaction',
        sms: 'Transaction Alert from First Tech Federal Credit Union.\n' +
            '***5267 had a transaction of ($116.45). Description: ACH Debit  OF HILLSBORO UTILITIES - UTILITIES . Date: Nov 12, 2025 ***5267 had a transaction of ($96.43). Description: ACH Debit CHASE CREDIT CRD  - EPAY . Date: Nov 12, 2025',
        expect: {count: 1, payee: 'City Of Hillsboro', amount: '116.45', paymentMethod: 'Debit Card'}
    },
    {
        name: 'First Tech - Debit Card Purchase Alert (duplicate - ignore)',
        sms: 'Debit Card Purchase Alert from First Tech Federal Credit Union. ACCT: Checking TRAN AMT: $218.13 TRAN DESC: POS Transaction 091155960 WINCO FOODS #40 Hillsboro ORUS AVAIL BAL: $5,186.70',
        expect: {count: 0}
    }
];

describe('src/index.js parser - data-driven cases', () => {
    for (const c of cases) {
        test(c.name, async () => {
            const steps = {trigger: {event: {body: {text: c.sms}}}};
            const exported = {};
            const $ = {
                export: (k, v) => {
                    exported[k] = v;
                }
            };

            const result = await componentSpec.run({steps, $});

            expect(Array.isArray(result)).toBe(true);
            expect(result.length).toBe(c.expect.count);

            if (c.expect.count > 0) {
                if (c.expect.payees) {
                    // multiple rows: check payees in order
                    const got = result.map(r => r[1]);
                    expect(got).toEqual(c.expect.payees);
                } else {
                    const row = result[0];
                    if (c.expect.payee) expect(row[1]).toBe(c.expect.payee);
                    if (c.expect.amount) expect(row[4]).toBe(c.expect.amount);
                    if (c.expect.paymentMethod) expect(row[5]).toBe(c.expect.paymentMethod);
                }
            }
        });
    }
});

