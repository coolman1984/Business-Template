import { recipe as tradingRecipe } from '@factory/recipe-inventory-orders';
import { maintenanceRecipe } from '@factory/recipe-maintenance-center';
import { CommandDispatcher, RecipeCatalog, accessControlCommands, type Db } from '@factory/platform-core';

/** The recipes this build serves. A company created from any of them runs on the same core code. */
export const catalog = new RecipeCatalog([tradingRecipe, maintenanceRecipe]);

/** The one command gateway: every recipe's commands, limited per company to what its recipe installs. */
export function createDispatcher(db: Db, recipes: RecipeCatalog = catalog): CommandDispatcher {
  const installed = recipes.registryFor.bind(recipes);
  return new CommandDispatcher(db, recipes.union, installed).register(...recipes.commands, ...accessControlCommands(installed));
}
