// CommonJS parser helper for tests and non-ESM tooling
exports.parseSmsText = function parseSmsText(smsText) {
  const transactions = [];
  if (!smsText) return transactions;

  // Chase Bank: "Prime Visa: You made a $9.26 transaction with Amazon.com on Aug 13, 2025 at 11:25 AM ET."
  const chase = smsText.match(/Prime Visa: You made a \$(\d+\.\d{2}) transaction with (.+?) on (Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec) (\d{1,2}), (\d{4})/);
  if (chase) {
    transactions.push({
      amount: chase[1],
      payee: chase[2].trim(),
      paymentMethod: 'Chase Card'
    });
    return transactions;
  }

  // Fallback: attempt to capture any $ amount
  const any = smsText.match(/\$(\d+\.\d{2})/);
  if (any) {
    transactions.push({ amount: any[1], payee: 'Manual Review Required', paymentMethod: 'Unknown' });
  }
  return transactions;
};
