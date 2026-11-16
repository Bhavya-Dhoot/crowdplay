// STUB (owner: W2 Judge Mode agent). Called by the engine's START_BOTS effect in demo rooms.
export async function startBots(_roomId: string, _roundNo: number): Promise<void> {}
/** Bots cast votes during VOTE (called by the engine when VOTE opens in a demo room). */
export async function startBotVotes(_roomId: string, _roundNo: number): Promise<void> {}
export function stopBots(_roomId: string): void {}
