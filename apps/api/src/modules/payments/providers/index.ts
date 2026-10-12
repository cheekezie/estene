import type { PaymentGateway } from './gateway';
import { SimulatorGateway } from './simulator';

/** The active gateway. SaySwitch will be selected here by PAYMENTS_PROVIDER once integrated. */
export const gateway: PaymentGateway = SimulatorGateway;
export { SimulatorGateway };
