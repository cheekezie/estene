import { env } from '../../../config/env';
import type { PaymentGateway } from './gateway';
import { SaukiPayGateway } from './saukipay';
import { SaySwitchGateway } from './sayswitch';
import { SimulatorGateway } from './simulator';

/**
 * One gateway handles both money in (customer payments) and money out (rider
 * payouts), chosen by PAYMENTS_PROVIDER and validated at boot. Keeping both on
 * one gateway means one wallet, one set of bank codes and one webhook.
 */
export const gateway: PaymentGateway =
  env.PAYMENTS_PROVIDER === 'saukipay'
    ? SaukiPayGateway
    : env.PAYMENTS_PROVIDER === 'sayswitch'
      ? SaySwitchGateway
      : SimulatorGateway;

/**
 * The gateway a payment or payout was started on. Both record their provider,
 * so after PAYMENTS_PROVIDER changes, ones still in flight on the old gateway are
 * checked there (and its webhooks accepted) as long as its secret key stays set.
 */
export function gatewayFor(provider: string | undefined): PaymentGateway | null {
  if (!provider || provider === gateway.name) return gateway;
  if (provider === 'saukipay' && env.SAUKIPAY_SECRET_KEY) return SaukiPayGateway;
  if (provider === 'sayswitch' && env.SAYSWITCH_SECRET_KEY) return SaySwitchGateway;
  return null;
}

export { SimulatorGateway };
