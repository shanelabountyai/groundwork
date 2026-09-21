import type { Notification } from '../generated/prisma/client';

/** Swap point for a real SMS/email provider (P2 #2 in the design brief). */
export interface Provider {
  send(n: Notification): Promise<void>;
}

/** No real provider is wired up yet — this just proves delivery would have happened. */
export const consoleProvider: Provider = {
  async send(n) {
    console.log(`[notify] ${n.channel} -> ${n.to}: ${n.body}`);
  },
};
