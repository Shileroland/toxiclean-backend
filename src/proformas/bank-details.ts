/** "Bank|Account name|Account number" from BANK_DETAILS_<country> (proformas and invoices). */
export function bankDetails(raw: string | undefined) {
  const [bank, accountName, accountNumber] = (raw ?? '')
    .split('|')
    .map((p) => p.trim());
  return bank && accountName && accountNumber
    ? { bank, accountName, accountNumber }
    : null;
}
