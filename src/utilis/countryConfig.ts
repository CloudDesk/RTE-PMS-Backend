export interface CountryConfig {
  country: 'IN' | 'AE';
  currency: 'INR' | 'AED';
  timezone: string;
  dateFormat: string;
  taxSystem: 'indian' | 'uae';
  payrollFrequency: 'monthly' | 'bi-weekly';
  workingDays: number[];
  defaultWorkingHours: number;
}

export const COUNTRY_CONFIGS: Record<string, CountryConfig> = {
  IN: {
    country: 'IN',
    currency: 'INR',
    timezone: 'Asia/Kolkata',
    dateFormat: 'DD/MM/YYYY',
    taxSystem: 'indian',
    payrollFrequency: 'monthly',
    workingDays: [1, 2, 3, 4, 5], // Monday to Friday
    defaultWorkingHours: 8
  },
  AE: {
    country: 'AE',
    currency: 'AED',
    timezone: 'Asia/Dubai',
    dateFormat: 'DD/MM/YYYY',
    taxSystem: 'uae',
    payrollFrequency: 'monthly',
    workingDays: [0, 1, 2, 3, 4], // Sunday to Thursday (UAE work week)
    defaultWorkingHours: 8
  }
};

export function getCountryConfig(country: string): CountryConfig {
  const config = COUNTRY_CONFIGS[country];
  if (!config) {
    throw new Error(`Unsupported country: ${country}`);
  }
  return config;
}

export function isUAECountry(country: string): boolean {
  return country === 'AE';
}

export function isIndianCountry(country: string): boolean {
  return country === 'IN';
}

export function getCurrencyForCountry(country: string): string {
  const config = getCountryConfig(country);
  return config.currency;
}

export function getTimezoneForCountry(country: string): string {
  const config = getCountryConfig(country);
  return config.timezone;
}

export function getWorkingDaysForCountry(country: string): number[] {
  const config = getCountryConfig(country);
  return config.workingDays;
}

export function getTaxSystemForCountry(country: string): string {
  const config = getCountryConfig(country);
  return config.taxSystem;
} 