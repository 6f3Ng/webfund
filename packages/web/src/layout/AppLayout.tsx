import { useState } from 'react';
import { Layout, Menu, Typography, Alert, Button, Drawer } from 'antd';
import { MenuOutlined } from '@ant-design/icons';
import { Link, Outlet, useLocation } from 'react-router-dom';
import { APP_NAME, COMPLIANCE_NOTICE } from '@/config';
import { useAutoRefresh } from '@/hooks/useAutoRefresh';
import { useIsMobile } from '@/hooks/useIsMobile';

const { Header, Content, Footer } = Layout;

const navItems = [
  { key: '/', label: <Link to="/">持仓</Link> },
  { key: '/portfolios', label: <Link to="/portfolios">集合管理</Link> },
  { key: '/strategies', label: <Link to="/strategies">策略</Link> },
  { key: '/backtest', label: <Link to="/backtest">回测</Link> },
  { key: '/settings', label: <Link to="/settings">设置</Link> },
];

export function AppLayout() {
  const location = useLocation();
  const isMobile = useIsMobile();
  const [drawerOpen, setDrawerOpen] = useState(false);
  useAutoRefresh();
  const selectedKey =
    navItems.find(
      (i) => i.key === location.pathname || (i.key !== '/' && location.pathname.startsWith(i.key)),
    )?.key ?? '/';

  return (
    <Layout style={{ minHeight: '100vh' }}>
      <Header
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 16,
          padding: isMobile ? '0 16px' : '0 24px',
        }}
      >
        {isMobile && (
          <Button
            type="text"
            aria-label="菜单"
            icon={<MenuOutlined style={{ color: '#fff', fontSize: 18 }} />}
            onClick={() => setDrawerOpen(true)}
          />
        )}
        <Typography.Title
          level={isMobile ? 5 : 4}
          style={{ color: '#fff', margin: 0, whiteSpace: 'nowrap', flex: isMobile ? 1 : 'none' }}
        >
          {APP_NAME}
        </Typography.Title>
        {!isMobile && (
          <Menu
            theme="dark"
            mode="horizontal"
            selectedKeys={[selectedKey]}
            items={navItems}
            style={{ flex: 1, minWidth: 0 }}
          />
        )}
      </Header>

      {isMobile && (
        <Drawer
          title={APP_NAME}
          placement="left"
          open={drawerOpen}
          onClose={() => setDrawerOpen(false)}
          styles={{ body: { padding: 0 } }}
        >
          <Menu
            mode="inline"
            selectedKeys={[selectedKey]}
            items={navItems}
            onClick={() => setDrawerOpen(false)}
          />
        </Drawer>
      )}

      <Content style={{ padding: isMobile ? '12px' : '16px 24px' }}>
        <Alert type="info" showIcon banner message={COMPLIANCE_NOTICE} style={{ marginBottom: 16 }} />
        <Outlet />
      </Content>
      <Footer style={{ textAlign: 'center', padding: isMobile ? '16px 12px' : undefined }}>
        {APP_NAME} · 数据本地存储 · 仅供学习参考
      </Footer>
    </Layout>
  );
}
