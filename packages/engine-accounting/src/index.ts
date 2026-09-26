export * from './capabilities.js';
export * from './money.js';
export * from './common.js';
export * from './accounts.js';
export * from './journal.js';
export * from './periods.js';
export * from './reports.js';

import { accountCommands } from './accounts.js';
import { journalCommands } from './journal.js';
import { periodCommands } from './periods.js';

export const accountingCommands = [...accountCommands, ...journalCommands, ...periodCommands];
