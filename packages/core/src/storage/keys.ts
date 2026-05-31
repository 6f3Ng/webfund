/** localStorage 键约定 */
export const STORAGE_KEYS = {
  portfolioIndex: 'fund.portfolios.index',
  portfolio: (id: string) => `fund.portfolio.${id}`,
  portfolioPrefix: 'fund.portfolio.',
  strategySetIndex: 'fund.strategySets.index',
  strategySet: (id: string) => `fund.strategySet.${id}`,
  strategySetPrefix: 'fund.strategySet.',
  settings: 'fund.settings',
} as const;
