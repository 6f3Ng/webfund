import React from 'react';
import ReactDOM from 'react-dom/client';
import { RouterProvider } from 'react-router-dom';
import { ConfigProvider, App as AntdApp } from 'antd';
import zhCN from 'antd/locale/zh_CN';
import { router } from '@/router';
import 'antd/dist/reset.css';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ConfigProvider locale={zhCN}>
      <AntdApp>
        <RouterProvider router={router} />
      </AntdApp>
    </ConfigProvider>
  </React.StrictMode>,
);
