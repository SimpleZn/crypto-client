import { strict as assert } from 'assert';
import BigNumber from 'bignumber.js';
import bs58 from 'bs58';
import { PairInfo } from 'exchange-info';
import Web3Utils from 'web3-utils';
import { DepositAddress } from '../pojo';

export const FIAT_SYMBOLS = ['CAD', 'CHF', 'EUR', 'GBP', 'JPY', 'USD'];

export type AsyncFunc = (...args: any[]) => Promise<any>;

export async function sleep(ms: number): Promise<any> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// See https://stackoverflow.com/a/29837695/381712
// Decorator for function is not supported in TypeScript,
// see https://github.com/microsoft/TypeScript/issues/7318
export function Retry(times: number = 1, logger: any = console) {
  assert.ok(times > 0);
  // eslint-disable-next-line func-names
  return function(
    // @ts-ignore: its value is never read
    target: Object,
    // @ts-ignore: its value is never read
    propertyName: string,
    propertyDesciptor: TypedPropertyDescriptor<AsyncFunc>,
  ): TypedPropertyDescriptor<AsyncFunc> {
    const originalMethod = propertyDesciptor.value!;
    // eslint-disable-next-line no-param-reassign,func-names
    propertyDesciptor.value = async function(...args: any[]) {
      let error = new Error();
      try {
        for (let i = 0; i < times; i += 1) {
          // eslint-disable-next-line no-await-in-loop
          return await originalMethod.apply(this, args);
        }
      } catch (e) {
        error = e;
        logger.error(e);
      }
      throw error;
    };
    return propertyDesciptor;
  };
}

export async function retry(
  func: (...args: any[]) => Promise<any>,
  times: number = 1,
  logger: any = console,
  ...args: any[]
) {
  assert.ok(times > 0);
  let error = new Error();
  try {
    for (let i = 0; i < times; i += 1) {
      // eslint-disable-next-line no-await-in-loop
      return await func(args);
    }
  } catch (e) {
    error = e;
    logger.error(e);
  }
  throw error;
}

export function calcPrecision(numberStr: string): number {
  if (!numberStr.includes('.')) return 0;
  return numberStr.length - numberStr.indexOf('.') - 1;
}

export function numberToString(n: number, decimal: number, ceil: boolean = false): string {
  const rounded = new BigNumber(n)
    .times(new BigNumber(10).pow(decimal + 1))
    .integerValue()
    .div(10);
  const restored = ceil
    ? rounded.integerValue(BigNumber.ROUND_CEIL)
    : rounded.integerValue(BigNumber.ROUND_DOWN);
  return restored
    .div(new BigNumber(10).pow(decimal))
    .toNumber()
    .toFixed(decimal);
}

export function validatePriceQuantity(
  pairInfo: PairInfo,
  price: string,
  quantity: string,
  quoteQuantity: string,
): boolean {
  assert.equal(
    calcPrecision(price),
    pairInfo.price_precision,
    `${pairInfo.exchange} ${pairInfo.normalized_pair} price_precision doesn't match`,
  );
  assert.equal(
    calcPrecision(quantity),
    pairInfo.base_precision,
    `${pairInfo.exchange} ${pairInfo.normalized_pair} base_precision doesn't match`,
  );
  assert.equal(
    calcPrecision(quoteQuantity),
    pairInfo.quote_precision,
    `${pairInfo.exchange} ${pairInfo.normalized_pair} quote_precision doesn't match`,
  );

  assert.ok(pairInfo.min_base_quantity || pairInfo.min_quote_quantity);
  if (pairInfo.min_quote_quantity && parseFloat(quoteQuantity) <= pairInfo.min_quote_quantity) {
    throw Error(
      `The order volume ${quoteQuantity} is less than min_quote_quantity ${
        pairInfo.min_quote_quantity
      } ${pairInfo.normalized_pair.split('_')[1]}`,
    );
  }
  if (pairInfo.min_base_quantity && parseFloat(quantity) < pairInfo.min_base_quantity) {
    throw Error(
      `The base quantity ${quantity} is less than min_base_quantity ${pairInfo.min_base_quantity} ${
        pairInfo.normalized_pair.split('_')[0]
      }`,
    );
  }
  return true;
}

export function convertPriceAndQuantityToStrings(
  pairInfo: PairInfo,
  price: number,
  quantity: number,
  sell: boolean,
): [string, string, string] {
  const priceStr = numberToString(price, pairInfo.price_precision, !sell);
  const quantityStr = numberToString(quantity, pairInfo.base_precision, false);
  const quoteQuantity = numberToString(
    parseFloat(priceStr) * parseFloat(quantityStr),
    pairInfo.quote_precision,
    !sell,
  );

  assert.ok(validatePriceQuantity(pairInfo, priceStr, quantityStr, quoteQuantity));

  return [priceStr, quantityStr, quoteQuantity];
}

export function calcTokenPlatform(depositAddresses: {
  [key: string]: { [key: string]: DepositAddress };
}): { [key: string]: string } {
  const result: { [key: string]: string } = {};
  Object.keys(depositAddresses).forEach(symbol => {
    const platforms = Object.keys(depositAddresses[symbol]);
    if (platforms.length === 1) {
      result[symbol] = platforms[0]; // eslint-disable-line prefer-destructuring
    }
  });

  return result;
}

export function detectPlatformFromAddress(address: string): string | undefined {
  if (address.indexOf('bc1') === 0) return 'BTC';

  try {
    const hexString = bs58.decode(address).toString('hex');
    if (hexString.length === 50) {
      if (hexString.indexOf('00') === 0 || hexString.indexOf('05') === 0) {
        return 'OMNI';
      }
      if (hexString.indexOf('41') === 0) {
        return 'TRC20';
      }
    }
  } catch (e) {
    // do nothing;
  }

  if (Web3Utils.isAddress(address)) return 'ERC20';

  if (address.length === 12) return 'EOS'; // TODO: await accountExists(address)

  if (address.indexOf('bnb') === 0) return 'BEP2';

  return undefined;
}

export function detectPlatform(address: string, symbol: string): string | undefined {
  const platform = detectPlatformFromAddress(address);

  if (platform === 'OMNI' && symbol !== 'USDT') return undefined;
  if (platform === 'ERC20' && (symbol === 'ETH' || symbol === 'ETC')) return undefined;
  if (platform === 'TRC20' && symbol === 'TRX') return undefined;
  if (platform === 'EOS' && symbol === 'EOS') return undefined;
  if (platform === 'BEP2' && symbol === 'BNB') return undefined;

  if (platform === symbol) return undefined;

  return platform;
}
