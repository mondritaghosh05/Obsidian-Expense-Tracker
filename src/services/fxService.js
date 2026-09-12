export const CURRENCIES = {
  USD: { symbol: '$', rate: 1.0, label: 'USD ($)' },
  EUR: { symbol: '€', rate: 0.917, label: 'EUR (€)' },
  GBP: { symbol: '£', rate: 0.789, label: 'GBP (£)' },
  JPY: { symbol: '¥', rate: 154.28, label: 'JPY (¥)' },
  CAD: { symbol: 'C$', rate: 1.364, label: 'CAD (C$)' }
};

let currentCurrencyKey = 'USD';

export function getActiveCurrency() {
  return {
    code: currentCurrencyKey,
    ...CURRENCIES[currentCurrencyKey]
  };
}

export function setActiveCurrency(code) {
  if (CURRENCIES[code]) {
    currentCurrencyKey = code;
  }
  return getActiveCurrency();
}

export function convertAmount(baseUsdAmount, currencyCode = currentCurrencyKey) {
  const currency = CURRENCIES[currencyCode] || CURRENCIES.USD;
  return baseUsdAmount * currency.rate;
}

export function formatCurrency(baseUsdAmount, currencyCode = currentCurrencyKey) {
  const currency = CURRENCIES[currencyCode] || CURRENCIES.USD;
  const converted = baseUsdAmount * currency.rate;
  
  const options = {
    minimumFractionDigits: currencyCode === 'JPY' ? 0 : 2,
    maximumFractionDigits: currencyCode === 'JPY' ? 0 : 2
  };
  
  return currency.symbol + converted.toLocaleString(undefined, options);
}
