import { Layout, Menu, Typography, Alert } from 'antd';
import { Link, Outlet, useLocation } from 'react-router-dom';
import { APP_NAME, COMPLIANCE_NOTICE } from '@/config';
import { useAutoRefresh } from '@/hooks/useAutoRefresh';

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
  useAutoRefresh();
  const selectedKey = navItems.find(
    (i) => i.key === location.pathname || (i.key !== '/' && location.pathname.startsWith(i.key)),
  )?.key ?? '/';

  return (
    <Layout style={{ minHeight: '100vh' }}>
      <Header style={{ display: 'flex', alignItems: 'center', gap: 24 }}>
        <Typography.Title level={4} style={{ color: '#fff', margin: 0, whiteSpace: 'nowrap' }}>
          {APP_NAME}
        </Typography.Title>
        <Menu
          theme="dark"
          mode="horizontal"
          selectedKeys={[selectedKey]}
          items={navItems}
          style={{ flex: 1, minWidth: 0 }}
        />
      </Header>
      <Content style={{ padding: '16px 24px' }}>
        <Alert type="info" showIcon banner message={COMPLIANCE_NOTICE} style={{ marginBottom: 16 }} />
        <Outlet />
      </Content>
      <Footer style={{ textAlign: 'center' }}>
        {APP_NAME} · 数据本地存储 · 仅供学习参考
      </Footer>
    </Layout>
  );
}
