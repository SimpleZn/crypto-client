// forked from https://github.com/WhaleEx/API/blob/master/sample/nodejs/whaleex-api.js
import { strict as assert } from 'assert';
import Axios from 'axios';
import { PairInfo } from 'exchange-info';
import { USER_CONFIG } from '../config';
import { convertPriceAndQuantityToStrings } from '../util';
// import debug from '../util/debug';
import { signData, signDataOrder, SymbolObj, WhaleExOrder } from '../util/whaleex_sign';

const URL_PREFIX = 'https://api.whaleex.com/BUSINESS';

async function getGlobalIds(remark = '0'): Promise<{ remark: string; list: string[] }> {
  const path = '/api/v1/order/globalIds';
  const params = signData('GET', path, { remark, size: 100 });
  const response = await Axios.get(`${URL_PREFIX}${path}?${params}`);
  assert.equal(response.status, 200);
  assert.equal(response.data.returnCode, '0');

  const tmp = response.data.result as { remark: string; list: string[] };
  console.info(`Calling getGlobalIds(remark:${remark}), new remark=${tmp.remark}`); // eslint-disable-line no-console
  return tmp;
}

/**
 * Get and cache global IDs.
 *
 * Usage:
 * const idStore = await createIdStore();
 * const id = await idStore.getId();
 */
async function createIdStore(): Promise<{ getId: () => Promise<string> }> {
  let { remark, list } = await getGlobalIds();
  let lastTimestamp = Date.now();
  return {
    getId: async (): Promise<string> => {
      const now = Date.now();
      // IDs expire after 5 minutes
      if (list.length === 0 || now - lastTimestamp >= 5 * 60 * 1000) {
        const { remark: _remark, list: _ids } = await getGlobalIds(remark);
        remark = _remark;
        list = _ids;
        lastTimestamp = now;
      }
      return list.pop()!;
    },
  };
}

const ID_STORE: { getId: () => Promise<string> } = {
  getId: async (): Promise<string> => {
    console.error('Please initilize ID_STORE'); // eslint-disable-line no-console
    return '0';
  },
};

export async function initilize(apiKey: string): Promise<void> {
  assert.ok(apiKey);
  USER_CONFIG.WHALEEX_API_KEY = apiKey;
  const idStore = await createIdStore();
  ID_STORE.getId = idStore.getId;
}

export async function placeOrder(
  pairInfo: PairInfo,
  price: number,
  quantity: number,
  sell: boolean,
): Promise<string> {
  assert.ok(pairInfo);
  assert.ok(USER_CONFIG.WHALEEX_API_KEY, 'APIKey is empty');

  const [priceStr, quantityStr] = convertPriceAndQuantityToStrings(pairInfo, price, quantity, sell);

  const path = '/api/v1/order/orders/place';

  const order: WhaleExOrder = {
    orderId: await ID_STORE.getId(),
    amount: quantityStr,
    price: priceStr,
    symbol: pairInfo.raw_pair,
    type: sell ? 'sell-limit' : 'buy-limit',
  };
  const symbolObj: SymbolObj = {
    baseToken: pairInfo.normalized_pair.split('_')[0],
    quoteToken: pairInfo.normalized_pair.split('_')[1],
    basePrecision: pairInfo.base_precision,
    quotePrecision: pairInfo.quote_precision,
    baseContract: pairInfo.base_contract!,
    quoteContract: pairInfo.quote_contract!,
  };
  const params = signDataOrder(order, symbolObj);

  const response = await Axios.post(`${URL_PREFIX}${path}?${params}`, order, {
    transformResponse: resp => {
      return JSON.parse(resp.replace(/"result":(\d+)/g, '"result":"$1"'));
    },
    responseType: 'json',
  });
  assert.equal(response.status, 200);

  if (response.data.returnCode === '0') {
    assert.equal(typeof response.data.result, 'string');
    return response.data.result as string;
  }
  throw new Error(JSON.stringify(response.data));
}

export async function cancelOrder(pairInfo: PairInfo, orderId: string): Promise<boolean> {
  assert.ok(pairInfo);
  assert.ok(USER_CONFIG.WHALEEX_API_KEY);

  const path = `/api/v1/order/orders/${orderId}/submitcancel`;
  const params = signData('POST', path);

  const response = await Axios.post(`${URL_PREFIX}${path}?${params}`);

  return response.status === 200 && response.data.returnCode === '0';
}

export async function queryOrder(
  pairInfo: PairInfo,
  orderId: string,
): Promise<{ [key: string]: any } | undefined> {
  assert.ok(pairInfo);
  assert.ok(USER_CONFIG.WHALEEX_API_KEY);

  const path = `/api/v1/order/orders/${orderId}`;
  const params = signData('GET', path);
  const response = await Axios.get(`${URL_PREFIX}${path}?${params}`);
  assert.equal(response.status, 200);
  if (response.data.returnCode === '0') {
    return response.data.result;
  }
  return undefined;
}

// for debug only
export async function queryOpenOrder(sell = false): Promise<{ [key: string]: any } | undefined> {
  const path = '/api/v1/order/openOrders';
  const params = signData('GET', path, { side: sell ? 'sell' : 'buy' });
  const response = await Axios.get(`${URL_PREFIX}${path}?${params}`);
  assert.equal(response.status, 200);

  if (response.data.returnCode === '0') {
    return response.data.result.content;
  }
  return undefined;
}

export async function queryAllBalances(): Promise<{ [key: string]: number }> {
  const path = '/api/v1/assets';
  const params = signData('GET', path);
  const response = await Axios.get(`${URL_PREFIX}${path}?${params}`);
  assert.equal(response.status, 200);

  if (response.data.returnCode !== '0') {
    return {};
  }
  const arr = response.data.result.list.content as {
    currency: string;
    currencyId: number;
    baseChain: string;
    totalAmount: string;
    stakeAmount: string;
    unStakingAmount: string;
    availableAmount: string;
    frozenAmount: string;
    fixedAmount: string;
    privatePlacement: string;
    listed: boolean;
    chainAmount: string;
    timestamp: number;
  }[];

  const result: { [key: string]: number } = {};
  arr.forEach(x => {
    result[x.currency] = parseFloat(x.availableAmount);
  });

  return result;
}

export async function queryBalance(symbol: string): Promise<number> {
  const path = `/api/v1/asset/${symbol}`;
  const params = signData('GET', path);
  const response = await Axios.get(`${URL_PREFIX}${path}?${params}`);
  assert.equal(response.status, 200);

  if (response.data.returnCode !== '0') {
    return 0;
  }
  assert.equal(symbol, response.data.result.currency);
  const total = parseFloat(response.data.result.total);
  const frozen = parseFloat(response.data.result.frozen);
  assert(total >= frozen);
  return total - frozen;
}
