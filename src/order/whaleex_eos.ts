import BigNumber from 'bignumber.js';
import { strict as assert } from 'assert';
import { Serialize } from 'eosjs';
import { PairInfo } from 'exchange-info';
import { sendEOSAction, sendEOSTokenAction, EOS_QUANTITY_PRECISION } from '../blockchain/eos';
import { numberToString } from '../util';

function createOrderId(): string {
  const orderId = new BigNumber(Math.floor(Date.now() / 1000))
    .times(65536)
    .plus(Math.floor(Math.random() * 65535))
    .toString();
  // add a whitespace per 12 digits
  return orderId.match(/.{1,12}/g)!.join(' ');
}

// eslint-disable-next-line import/prefer-default-export
export function createOrder(
  eosAccount: string,
  pairInfo: PairInfo,
  price: string,
  quantity: string,
  sell: boolean,
): [Serialize.Action, string] {
  assert.ok(pairInfo);
  assert.ok(eosAccount);
  assert.equal(pairInfo.quote_contract, 'eosio.token');
  assert.ok(pairInfo.normalized_pair.endsWith('_EOS'));
  assert.equal(pairInfo.quote_precision, EOS_QUANTITY_PRECISION);

  // const [priceStr, quantityStr] = convertPriceAndQuantityToStrings(pairInfo, price, quantity, sell);

  const orderId = createOrderId();

  const baseQuantity = new BigNumber(quantity)
    .times(10 ** pairInfo.base_precision)
    .integerValue(BigNumber.ROUND_FLOOR)
    .toString();
  const quoteQuantity = numberToString(
    parseFloat(price) * parseFloat(quantity),
    pairInfo.quote_precision,
    true,
  );
  const quoteQuantityStr = new BigNumber(quoteQuantity)
    .times(10 ** pairInfo.quote_precision)
    .integerValue(BigNumber.ROUND_CEIL)
    .toString();

  const memo = `order:${eosAccount} | ${
    sell ? 'sell' : 'buy'
  } | limit | ${pairInfo.base_contract!} | ${
    pairInfo.baseCurrency
  } | ${baseQuantity} | eosio.token | EOS | ${quoteQuantityStr} | 10 | 10 | whaleexchang | ${orderId} | ${Math.floor(
    Date.now() / 1000,
  )} | | ${price} | coinrace.com:`;

  const action = sell
    ? sendEOSTokenAction(
        eosAccount,
        'whaleextrust',
        pairInfo.baseCurrency,
        pairInfo.base_contract!,
        quantity,
        memo,
      )
    : sendEOSAction(eosAccount, 'whaleextrust', quoteQuantity, memo);

  return [action, orderId];
}
