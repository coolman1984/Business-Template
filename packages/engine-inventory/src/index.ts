export * from './capabilities.js';
export * from './quantity.js';
export * from './setup.js';
export * from './documents.js';
export * from './queries.js';
export * from './imports.js';

import { documentCommands } from './documents.js';
import { importCommands } from './imports.js';
import { setupCommands } from './setup.js';

export const inventoryCommands = [...setupCommands, ...documentCommands, ...importCommands];
