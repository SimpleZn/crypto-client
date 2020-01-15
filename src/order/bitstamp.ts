import { strict as assert } from 'assert';
import Axios from 'axios';
import crypto from 'crypto';
import { PairInfo } from 'exchange-info';
import uuidv1 from 'uuid/v1';
import { USER_CONFIG } from '../config';
import { convertPriceAndQuantityToStrings } from '../util';

const DOMAIN = 'www.bitstamp.net';

function sign(
  apiKey: string,
  apiSecret: string,
  verb: 'GET' | 'POST',
  path: string,
  data: string,
): { [key: string]: any } {
  assert.ok(apiKey);
  assert.ok(apiSecret);
  assert.ok(path);
  assert.ok(data);

  const CONTENT_TYPE = 'application/x-www-form-urlencoded';
  const nonce = uuidv1();
  const timestamp = Date.now();
  const stringToSign = `BITSTAMP ${apiKey}${verb}${DOMAIN}${path}${CONTENT_TYPE}${nonce}${timestamp}v2${data}`;
  const signature = crypto
    .createHmac('sha256', apiSecret)
    .update(stringToSign)
    .digest('hex');
  const headers: { [key: string]: any } = {
    'X-Auth': `BITSTAMP ${apiKey}`,
    'X-Auth-Signature': signature,
    'X-Auth-Nonce': nonce,
    'X-Auth-Timestamp': timestamp,
    'X-Auth-Version': 'v2',
    'Content-Type': CONTENT_TYPE,
  };

  return headers;
}

function sign_v1(apiKey: string, apiSecret: string, customerId: number, nonce: number): string {
  assert.ok(apiKey);
  assert.ok(apiSecret);
  assert.ok(customerId);
  assert.ok(nonce);

  const message = `${nonce}${customerId}${apiKey}`;

  const signature = crypto
    .createHmac('sha256', apiSecret)
    .update(message)
    .digest('hex')
    .toUpperCase();

  return signature;
}

export async function placeOrder(
  pairInfo: PairInfo,
  price: number,
  quantity: number,
  sell: boolean,
): Promise<string> {
  assert.ok(pairInfo);
  assert.ok(USER_CONFIG.BITSTAMP_API_KEY);
  assert.ok(USER_CONFIG.BITSTAMP_API_SECRET);

  const [priceStr, quantityStr] = convertPriceAndQuantityToStrings(pairInfo, price, quantity, sell);

  const path = `/api/v2/${sell ? 'sell' : 'buy'}/${pairInfo.raw_pair}/`;

  const payload = `price=${priceStr}&amount=${quantityStr}`;
  const headers = sign(
    USER_CONFIG.BITSTAMP_API_KEY!,
    USER_CONFIG.BITSTAMP_API_SECRET!,
    'POST',
    path,
    payload,
  );

  const response = await Axios.post(`https://${DOMAIN}${path}`, payload, {
    headers,
  });
  assert.equal(response.status, 200);

  return response.data.id;
}

export async function queryOrder(
  pairInfo: PairInfo,
  orderId: string,
): Promise<{ [key: string]: any } | undefined> {
  assert.ok(pairInfo);

  const path = '/api/order_status/';

  const nonce = Date.now();
  const signature = sign_v1(
    USER_CONFIG.BITSTAMP_API_KEY!,
    USER_CONFIG.BITSTAMP_API_SECRET!,
    USER_CONFIG.BITSTAMP_USER_ID!,
    nonce,
  );
  const payload = `id=${orderId}&key=${USER_CONFIG.BITSTAMP_API_KEY!}&signature=${signature}&nonce=${nonce}`;

  const response = await Axios.post(`https://${DOMAIN}${path}`, payload);
  assert.equal(response.status, 200);

  return response.data.error ? undefined : response.data;
}

export async function cancelOrder(pairInfo: PairInfo, orderId: string): Promise<boolean> {
  assert.ok(pairInfo);
  assert.ok(orderId);

  const path = '/api/v2/cancel_order/';

  const payload = `id=${orderId}`;
  const headers = sign(
    USER_CONFIG.BITSTAMP_API_KEY!,
    USER_CONFIG.BITSTAMP_API_SECRET!,
    'POST',
    path,
    payload,
  );

  const response = await Axios.post(`https://${DOMAIN}${path}`, payload, {
    headers,
  });
  assert.equal(response.status, 200);

  return response.data.id.toString() === orderId;
}

export async function queryAllBalances(): Promise<{ [key: string]: number }> {
  const path = '/api/v2/balance/';

  const payload = '{}';
  const headers = sign(
    USER_CONFIG.BITSTAMP_API_KEY!,
    USER_CONFIG.BITSTAMP_API_SECRET!,
    'POST',
    path,
    payload,
  );

  const response = await Axios.post(`https://${DOMAIN}${path}`, payload, {
    headers,
  });
  assert.equal(response.status, 200);

  const result: { [key: string]: number } = {};
  Object.keys(response.data)
    .filter(x => x.endsWith('_available'))
    .forEach(key => {
      const symbol = key.substring(0, key.indexOf('_available')).toUpperCase();
      result[symbol] = parseFloat(response.data[key] as string);
    });
  return result;
}
