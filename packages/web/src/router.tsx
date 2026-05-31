import { createBrowserRouter } from 'react-router-dom';
import type { RouteObject } from 'react-router-dom';
import { AppLayout } from '@/layout/AppLayout';
import { HomePage } from '@/pages/HomePage';
import { PortfoliosPage } from '@/pages/PortfoliosPage';
import { SettingsPage } from '@/pages/SettingsPage';
import { StrategiesPage } from '@/pages/StrategiesPage';
import { BacktestPage } from '@/pages/BacktestPage';

const routes: RouteObject[] = [
  {
    path: '/',
    element: <AppLayout />,
    children: [
      { index: true, element: <HomePage /> },
      { path: 'portfolios', element: <PortfoliosPage /> },
      { path: 'strategies', element: <StrategiesPage /> },
      { path: 'backtest', element: <BacktestPage /> },
      { path: 'settings', element: <SettingsPage /> },
    ],
  },
];

export const router = createBrowserRouter(routes);
