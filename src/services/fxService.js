export const CURRENCIES = {
  USD: { symbol: '$', rate: 1.0, label: 'USD ($)' },
  INR: { symbol: '₹', rate: 83.50, label: 'INR (₹)' },
  EUR: { symbol: '€', rate: 0.917, label: 'EUR (€)' },
  GBP: { symbol: '£', rate: 0.789, label: 'GBP (£)' },
  JPY: { symbol: '¥', rate: 154.28, label: 'JPY (¥)' },
  CAD: { symbol: 'C$', rate: 1.364, label: 'CAD (C$)' }
};

let baseCurrencyKey = 'USD';
let activeDisplayCurrencyKey = 'USD';

export function setBaseCurrency(code) {
  if (CURRENCIES[code]) {
    baseCurrencyKey = code;
  }
  return baseCurrencyKey;
}

export function getBaseCurrency() {
  return baseCurrencyKey;
}

export function getActiveCurrency() {
  return {
    code: activeDisplayCurrencyKey,
    ...CURRENCIES[activeDisplayCurrencyKey]
  };
}

export function setActiveCurrency(code) {
  if (CURRENCIES[code]) {
    activeDisplayCurrencyKey = code;
  }
  return getActiveCurrency();
}

/**
 * Returns dynamic exchange rate pairs based on current Base Currency.
 */
export function getFxTickerPairs() {
  const baseRate = CURRENCIES[baseCurrencyKey].rate;
  
  const pairs = [
    { name: baseCurrencyKey === 'USD' ? 'EUR/USD' : `EUR/${baseCurrencyKey}`, value: (CURRENCIES.EUR.rate / baseRate).toFixed(4), change: '+0.14%', positive: true },
    { name: baseCurrencyKey === 'USD' ? 'USD/INR' : `INR/${baseCurrencyKey}`, value: (CURRENCIES.INR.rate / baseRate).toFixed(2), change: '+0.25%', positive: true },
    { name: baseCurrencyKey === 'USD' ? 'USD/GBP' : `GBP/${baseCurrencyKey}`, value: (CURRENCIES.GBP.rate / baseRate).toFixed(4), change: '-0.06%', positive: false },
    { name: baseCurrencyKey === 'USD' ? 'USD/JPY' : `JPY/${baseCurrencyKey}`, value: (CURRENCIES.JPY.rate / baseRate).toFixed(2), change: '+0.38%', positive: true },
    { name: baseCurrencyKey === 'USD' ? 'USD/CAD' : `CAD/${baseCurrencyKey}`, value: (CURRENCIES.CAD.rate / baseRate).toFixed(4), change: '+0.09%', positive: true }
  ];

  return pairs;
}

export function convertAmount(baseUsdAmount, currencyCode = activeDisplayCurrencyKey) {
  const currency = CURRENCIES[currencyCode] || CURRENCIES.USD;
  return baseUsdAmount * currency.rate;
}

export function formatCurrency(baseUsdAmount, currencyCode = activeDisplayCurrencyKey) {
  const currency = CURRENCIES[currencyCode] || CURRENCIES.USD;
  const converted = baseUsdAmount * currency.rate;
  
  const isNoDecimals = currencyCode === 'JPY';
  const options = {
    minimumFractionDigits: isNoDecimals ? 0 : 2,
    maximumFractionDigits: isNoDecimals ? 0 : 2
  };
  
  return currency.symbol + converted.toLocaleString(undefined, options);
}
