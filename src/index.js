const componentSpec = {
        async run({steps, $}) {
            // Get the plain text email body
            let smsText = steps.trigger.event.body.text;
            // If plain text is not available, fall back to HTML
            if (!smsText && steps.trigger.event.body.html) {
                const {parse} = await import('node-html-parser');
                const root = parse(steps.trigger.event.body.html);
                const body = root.querySelector('body');
                smsText = body ? body.textContent.trim() : '';
                // Clean up extra whitespace or HTML artifacts
                smsText = smsText.replace(/\s+/g, ' ').trim();
            }
            // If no text is found, throw an error for debugging
            if (!smsText) {
                throw new Error('No SMS text found in email body (neither text nor HTML)');
            }
            if (smsText.includes('Debit Card Purchase Alert from First Tech Federal Credit Union')) {
                $.export('transactions', []);
                return [];
            }
            // Log the extracted SMS for debugging
            // console.log('Extracted SMS:', smsText);
            // Array to store all transactions
            let transactions = [];
            // Payees we NEVER want to record (credit card payments, etc.)
            const excludedPayees = [
                'CITI CARD ONLINE - PAYMENT',
                'CHASE CREDIT CRD - EPAY',
                'CAPITAL ONE - MOBILE PMT',
                'ACH Debit CITI CARD ONLINE - PAYMENT',
                'ACH Debit CHASE CREDIT CRD - EPAY',
                'ACH Debit CAPITAL ONE - MOBILE PMT'
            ].map(p => p.trim().toUpperCase());

            const toTitleCase = str => str
                ? str.toLowerCase()
                    .replace(/\b\w/g, c => c.toUpperCase())
                    .replace(/#(\d+)/g, '#$1')
                : str;

            // Regex patterns for each sender
            const patterns = [
                {
                    // Chase variant: "You made an online, phone, or mail transaction of $75.99 with Amazon.com on Nov 12, 2025..."
                    regex: /Prime Visa: You made(?: an online, phone, or mail transaction of| an online, phone, or mail transaction of| an online, phone, or mail transaction of)? \$(\d+\.\d{2})(?: transaction)? (?:with )(.+?) on (Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec) (\d{1,2}), (\d{4})/,
                    paymentMethod: 'Chase Card',
                    extract: (match) => ({
                        amount: match[1],
                        payee: toTitleCase(match[2])
                    })
                },
                {
                    // Chase Bank: "Prime Visa: You made a $9.26 transaction with Amazon.com on Aug 13, 2025 at 11:25 AM ET."
                    regex: /Prime Visa: You made a \$(\d+\.\d{2}) transaction with (.+?) on (Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec) (\d{1,2}), (\d{4})/,
                    paymentMethod: 'Chase Card',
                    extract: (match) => ({
                        amount: match[1],
                        payee: toTitleCase(match[2])
                    })
                },
                {
                    // Chase pending credit: "Prime Visa: You have a $24.97 pending credit from COSTCO WHSE #0692."
                    regex: /Prime Visa: You have a \$(\d+\.\d{2}) pending credit from (.+?)\./,
                    paymentMethod: 'Chase Card',
                    extract: (match) => ({
                        amount: `-${match[1]}`,  // Make amount negative for credits
                        payee: toTitleCase(match[2])
                    })
                },
                {
                    // Capital One: A chrge or hold for $141.60 on August 11, 2025 was placed on your Savor Credit Card (8385) at CASA LOLA CORNELIUS."
                    regex: /Capital One: A chrge or hold for \$(\d+\.\d{2}) on (January|February|March|April|May|June|July|August|September|October|November|December) (\d{1,2}), (\d{4}) was placed on your Savor Credit Card \(\d{4}\) at (.+?)\./,
                    paymentMethod: 'Savor Card',
                    extract: (match) => ({
                        amount: match[1],
                        payee: toTitleCase(match[5])
                    })
                },
                {
                    // Capital One payment scheduled (ignore)
                    regex: /Capital One Alert: Your payment of \$(\d+\.\d{2}) is scheduled for (January|February|March|April|May|June|July|August|September|October|November|December) (\d{1,2}), (\d{4})\./,
                    paymentMethod: 'Savor Card',
                    extract: () => null  // Return null to skip
                },
                {
                    // Capital One payment confirmation (ignore)
                    regex: /Capital One Alert: You paid \$(\d+\.\d{2}) to your Savor Credit Card.*on (January|February|March|April|May|June|July|August|September|October|November|December) (\d{1,2}), (\d{4})\./,
                    paymentMethod: 'Savor Card',
                    extract: () => null  // Return null to skip
                },
                {
                    // Citi Alerts – Card-not-present (online)
                    regex: /Citi Alert: Card ending in \d{4} was not present for a \$(\d+\.\d{2}) (international )?transaction at\s+([A-Z0-9][A-Z0-9.* -]*?(?:\.[A-Z0-9.*-]+)*?)\.\s*(View|citi|$)/i,
                    paymentMethod: 'Citibank Card',
                    extract: (match) => ({
                        amount: match[1],
                        payee: toTitleCase(match[3].trim().replace(/\s+/g, ' '))
                    })
                },
                {
                    // Citi Alerts (In-Person) - FINAL robust version
                    regex: /Citi Alert: A \$(\d+\.\d{2}) transaction was made at\s+([A-Z0-9][A-Z0-9.* -]*?(?:\.[A-Z0-9.*-]+)*?) on card ending in \d{4}/i,
                    paymentMethod: 'Citibank Card',
                    extract: (match) => ({
                        amount: match[1],
                        payee: toTitleCase(match[2].trim().replace(/\s+/g, ' '))
                    })
                },
                {
                    // First Tech CU (Single Debit): "Debit Card Purchase Alert from First Tech Federal Credit Union. ACCT: Checking TRAN AMT: $180.32 TRAN DESC: POS Transaction 091155960 WINCO FOO 7330 Nw Butl Hillsboro ORUS AVAIL BAL: $3,415.12"
                    regex: /Debit Card Purchase Alert from First Tech Federal Credit Union\.\s+ACCT: Checking\s+TRAN AMT: \$(\d+\.\d{2})\s+TRAN DESC: POS Transaction \d*\s+(.+?)\s+AVAIL BAL:/,
                    paymentMethod: 'Debit Card',
                    extract: (match) => ({
                        amount: match[1],
                        payee: toTitleCase(match[2].trim())
                    })
                }
            ];
            // Flag to track if any pattern matched
            let matched = false;

// First Tech Federal Credit Union – multi-transaction blocks (WITH REAL DATES)
            if (smsText.includes('Transaction Alert from First Tech Federal Credit Union')) {
                const blocks = smsText.split('***').slice(1);
                for (const block of blocks) {
                    // Capture: amount, payee, month name, day, year
                    const match = block.match(/had a transaction of \(\$(\d+(?:\.\d+)?)\)\. Description: (.*?)\s+Date:\s*([A-Za-z]+)\s+(\d{1,2}),\s*(\d{4})/s);
                    if (match) {
                        const amount = match[1];
                        let payee = match[2]
                            .replace(/\s*\.$/, '')      // remove trailing " ."
                            .trim();

                        const monthName = match[3];
                        const day = match[4].padStart(2, '0');
                        const year = match[5];

                        // Build proper MM/DD/YYYY date from SMS
                        const monthMap = {
                            Jan: '01', Feb: '02', Mar: '03', Apr: '04', May: '05', Jun: '06',
                            Jul: '07', Aug: '08', Sep: '09', Oct: '10', Nov: '11', Dec: '12'
                        };
                        const dateStr = `${monthMap[monthName] || '01'}/${day}/${year}`;

                        const normalizedPayee = payee.toUpperCase().replace(/\s+/g, ' ').trim();

                        // Skip credit card payments
                        if (excludedPayees.some(ex => normalizedPayee.includes(ex))) {
                            continue;
                        }

                        const paymentMethod = normalizedPayee.includes('VENMO') ? 'Venmo' : 'Debit Card';

                        transactions.push({
                            date: dateStr,
                            amount: amount,
                            payee: toTitleCase(payee),
                            paymentMethod: paymentMethod
                        });
                    }
                }

            } else {
                // Try to match other patterns
                for (const pattern of patterns
                    ) {
                    const match = smsText.match(pattern.regex);
                    if (match) {
                        matched = true;
                        const extracted = pattern.extract(match);
                        if (extracted === null) {
                            // Skip ignored patterns like payments
                            break;
                        }
                        const payee = extracted.payee.trim();
                        // Skip excluded payees
                        if (!excludedPayees.includes(payee)) {
                            transactions.push({
                                date: new Date(Date.now()).toLocaleDateString('en-US', {
                                    month: '2-digit',
                                    day: '2-digit',
                                    year: 'numeric'
                                }), // Current date as MM/DD/YYYY
                                ...extracted,
                                paymentMethod: pattern.paymentMethod
                            });
                        }
                        break;
                    }
                }
// Handle unknown formats only if no pattern matched
                if (transactions.length === 0 && !matched) {
                    const payee = 'Manual Review Required';
                    const amount = smsText.match(/\$(\d+\.\d{2})/)?.[1] || 'Unknown';
                    if (!excludedPayees.includes(payee)) {
                        transactions.push({
                            date: new Date(Date.now()).toLocaleDateString('en-US', {
                                month: '2-digit',
                                day: '2-digit',
                                year: 'numeric'
                            }), // Current date as MM/DD/YYYY
                            payee: toTitleCase(payee),
                            amount: amount,
                            paymentMethod: 'Unknown'
                        });
                    }
                }
            }
// Export transactions as array of arrays for columns A, B, E, F
            $.export('transactions', transactions.map(t => [t.date, t.payee, "", "", t.amount, t.paymentMethod]));
            return transactions.map(t => [t.date, t.payee, "", "", t.amount, t.paymentMethod]);
        }
    }
;

const maybeWrapped = typeof defineComponent !== 'undefined' ? defineComponent(componentSpec) : componentSpec;
export default maybeWrapped;
export {componentSpec};
