
const COUNTRY_CURRENCY_MAP: Record<string, { currency: string; locale: string }> = {
    AE: { currency: 'AED', locale: 'en-AE' },
    IN: { currency: 'INR', locale: 'en-IN' },
};

export function formatCurrency(amount: number | null | undefined, country?: string): string {
    // Normalize numeric input; treat null/undefined/non-finite as 0
    const numericAmount = typeof amount === 'number' && Number.isFinite(amount)
        ? amount
        : 0;

    const normalizedCountry = country?.toUpperCase() ?? 'IN';
    const { currency, locale } = COUNTRY_CURRENCY_MAP[normalizedCountry] || COUNTRY_CURRENCY_MAP.IN;

    try {
        return new Intl.NumberFormat(locale, {
            style: 'currency',
            currency,
            maximumFractionDigits: 0,
        }).format(numericAmount);
    } catch {
        // Fallback to a simple string if Intl.NumberFormat fails
        return `${currency} ${Math.round(numericAmount)}`;
    }
}
/**
 * Helper to convert number to Words (Indian numbering system)
 */
export function numberToWords(num: number): string {
    const a = ['', 'one ', 'two ', 'three ', 'four ', 'five ', 'six ', 'seven ', 'eight ', 'nine ', 'ten ', 'eleven ', 'twelve ', 'thirteen ', 'fourteen ', 'fifteen ', 'sixteen ', 'seventeen ', 'eighteen ', 'nineteen '];
    const b = ['', '', 'twenty', 'thirty', 'forty', 'fifty', 'sixty', 'seventy', 'eighty', 'ninety'];

    const numStr = num.toString();
    if (numStr.length > 9) return 'overflow';
    const n = ('000000000' + numStr).substr(-9).match(/^(\d{2})(\d{2})(\d{2})(\d{1})(\d{2})$/);
    if (!n) return '';
    let str = '';
    str += (Number(n[1]) != 0) ? (a[Number(n[1])] || b[Number(n[1][0])] + ' ' + a[Number(n[1][1])]) + 'crore ' : '';
    str += (Number(n[2]) != 0) ? (a[Number(n[2])] || b[Number(n[2][0])] + ' ' + a[Number(n[2][1])]) + 'lakh ' : '';
    str += (Number(n[3]) != 0) ? (a[Number(n[3])] || b[Number(n[3][0])] + ' ' + a[Number(n[3][1])]) + 'thousand ' : '';
    str += (Number(n[4]) != 0) ? (a[Number(n[4])] || b[Number(n[4][0])] + ' ' + a[Number(n[4][1])]) + 'hundred ' : '';
    str += (Number(n[5]) != 0) ? ((str != '') ? 'and ' : '') + (a[Number(n[5])] || b[Number(n[5][0])] + ' ' + a[Number(n[5][1])]) : '';
    return str.trim();
}
