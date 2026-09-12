export const CURRENCIES = {
  INR: { symbol: '₹', rate: 1.0, label: 'INR (₹)' },
  USD: { symbol: '$', rate: 0.012, label: 'USD ($)' },
  EUR: { symbol: '€', rate: 0.011, label: 'EUR (€)' },
  GBP: { symbol: '£', rate: 0.0094, label: 'GBP (£)' },
  JPY: { symbol: '¥', rate: 1.85, label: 'JPY (¥)' },
  CAD: { symbol: 'C$', rate: 0.016, label: 'CAD (C$)' }
};

let baseCurrencyKey = 'INR';
let activeDisplayCurrencyKey = 'INR';

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
 * Returns dynamic exchange rate pairs based on current Base Currency (Default INR).
 */
export function getFxTickerPairs() {
  const baseRate = CURRENCIES[baseCurrencyKey].rate;
  
  const pairs = [
    { name: baseCurrencyKey === 'INR' ? 'INR/USD' : `USD/${baseCurrencyKey}`, value: (CURRENCIES.USD.rate / baseRate).toFixed(4), change: '+0.14%', positive: true },
    { name: baseCurrencyKey === 'INR' ? 'INR/EUR' : `EUR/${baseCurrencyKey}`, value: (CURRENCIES.EUR.rate / baseRate).toFixed(4), change: '+0.25%', positive: true },
    { name: baseCurrencyKey === 'INR' ? 'INR/GBP' : `GBP/${baseCurrencyKey}`, value: (CURRENCIES.GBP.rate / baseRate).toFixed(4), change: '-0.06%', positive: false },
    { name: baseCurrencyKey === 'INR' ? 'INR/JPY' : `JPY/${baseCurrencyKey}`, value: (CURRENCIES.JPY.rate / baseRate).toFixed(2), change: '+0.38%', positive: true },
    { name: baseCurrencyKey === 'INR' ? 'INR/CAD' : `CAD/${baseCurrencyKey}`, value: (CURRENCIES.CAD.rate / baseRate).toFixed(4), change: '+0.09%', positive: true }
  ];

  return pairs;
}

export function convertAmount(baseAmount, currencyCode = activeDisplayCurrencyKey) {
  const currency = CURRENCIES[currencyCode] || CURRENCIES.INR;
  return baseAmount * currency.rate;
}

export function formatCurrency(baseAmount, currencyCode = activeDisplayCurrencyKey) {
  const currency = CURRENCIES[currencyCode] || CURRENCIES.INR;
  const converted = baseAmount * currency.rate;
  
  const isNoDecimals = currencyCode === 'JPY';
  const options = {
    minimumFractionDigits: isNoDecimals ? 0 : 2,
    maximumFractionDigits: isNoDecimals ? 0 : 2
  };
  
  return currency.symbol + converted.toLocaleString('en-IN', options);
}
