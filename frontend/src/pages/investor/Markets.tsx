import React, { useState, useMemo } from 'react';
import {
  Table,
  Space,
  Button,
  Select,
  Typography,
  Drawer,
  Statistic,
  Tag,
  Row,
  Col,
  Segmented,
  Input,
  Grid,
} from 'antd';
import type { TableColumnsType } from 'antd';
import {
  PlusOutlined,
  CheckOutlined,
  AreaChartOutlined,
  StarOutlined,
  StarFilled,
} from '@ant-design/icons';
import { MOCK_SECURITIES, MockSecurity } from '../../data/fixtures/market';
import { MOCK_OHLC_DATA } from '../../data/fixtures/ohlc';
import { CandlestickChart } from '../../components/charts/CandlestickChart';
import { formatLKR, formatSigned, formatPercentage } from '../../utils/format';
import { classifyTrend } from '../../utils/trend';

const { Title, Text, Paragraph } = Typography;

export const Markets: React.FC = () => {
  const screens = Grid.useBreakpoint();
  const isMobile = screens.md === false;

  const [activeTab, setActiveTab] = useState<string>('All');
  const [selectedSector, setSelectedSector] = useState<string>('All');
  const [selectedCap, setSelectedCap] = useState<string>('All');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [watchedSymbols, setWatchedSymbols] = useState<Set<string>>(new Set());
  
  // Drawer states
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [selectedSecurity, setSelectedSecurity] = useState<MockSecurity | null>(null);

  const toggleWatch = (symbol: string, e: React.MouseEvent) => {
    e.stopPropagation(); // prevent opening drawer on star click
    setWatchedSymbols((prev) => {
      const next = new Set(prev);
      if (next.has(symbol)) {
        next.delete(symbol);
      } else {
        next.add(symbol);
      }
      return next;
    });
  };

  // Sector list from mock data
  const sectors = useMemo(() => {
    const list = new Set(MOCK_SECURITIES.map((s) => s.sector));
    return ['All', ...Array.from(list)];
  }, []);

  // Filter and sort securities based on active states
  const filteredSecurities = useMemo(() => {
    let result = [...MOCK_SECURITIES];

    // Search query
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      result = result.filter(
        (s) =>
          s.symbol.toLowerCase().includes(query) ||
          s.name.toLowerCase().includes(query)
      );
    }

    // Tab filtering (All/Gainers/Losers/Most Active)
    if (activeTab === 'Gainers') {
      result = result.filter((s) => s.change > 0).sort((a, b) => b.changePct - a.changePct);
    } else if (activeTab === 'Losers') {
      result = result.filter((s) => s.change < 0).sort((a, b) => a.changePct - b.changePct);
    } else if (activeTab === 'Most Active') {
      result = result.sort((a, b) => b.volume - a.volume);
    }

    // Sector filtering
    if (selectedSector !== 'All') {
      result = result.filter((s) => s.sector === selectedSector);
    }

    // Market cap filtering
    if (selectedCap !== 'All') {
      result = result.filter((s) => s.capCategory === selectedCap);
    }

    return result;
  }, [activeTab, selectedSector, selectedCap, searchQuery]);

  const handleRowClick = (record: MockSecurity) => {
    setSelectedSecurity(record);
    setDrawerOpen(true);
  };

  const columns: TableColumnsType<MockSecurity> = [
    {
      title: 'Symbol',
      dataIndex: 'symbol',
      key: 'symbol',
      render: (symbol: string, record: MockSecurity) => (
        <div>
          <Text style={{ fontWeight: 700, color: '#e2e8f0' }}>{symbol.split('.')[0]}</Text>
          <br />
          <Text style={{ fontSize: '10px', color: '#64748b' }}>{symbol}</Text>
        </div>
      ),
    },
    {
      title: 'Company Name',
      dataIndex: 'name',
      key: 'name',
      responsive: ['md'],
      render: (name: string) => <Text style={{ color: '#90a1b9' }}>{name}</Text>,
    },
    {
      title: 'Sector',
      dataIndex: 'sector',
      key: 'sector',
      render: (sector: string) => <Text style={{ color: '#64748b' }}>{sector}</Text>,
    },
    {
      title: 'Cap',
      dataIndex: 'capCategory',
      key: 'capCategory',
      render: (cap: string) => {
        let color = '#64748b';
        if (cap === 'Large') color = '#722ed1';
        if (cap === 'Mid') color = '#13c2c2';
        return <Tag color="rgba(255,255,255,0.03)" style={{ borderColor: 'rgba(255,255,255,0.06)', color }}>{cap}</Tag>;
      },
    },
    {
      title: 'Price',
      dataIndex: 'price',
      key: 'price',
      align: 'right' as const,
      render: (price: number) => (
        <Text style={{ fontFamily: 'monospace', fontWeight: 600 }}>
          {price.toFixed(2)}
        </Text>
      ),
    },
    {
      title: 'Change',
      dataIndex: 'change',
      key: 'change',
      align: 'right' as const,
      render: (change: number) => {
        const trend = classifyTrend(change);
        const color = trend === 'positive' ? '#00d492' : trend === 'negative' ? '#ff6467' : '#90a1b9';
        return (
          <Text style={{ color, fontFamily: 'monospace', fontWeight: 600 }}>
            {formatSigned(change, 2)}
          </Text>
        );
      },
    },
    {
      title: '% Change',
      dataIndex: 'changePct',
      key: 'changePct',
      align: 'right' as const,
      render: (pct: number) => {
        const trend = classifyTrend(pct);
        const color = trend === 'positive' ? '#00d492' : trend === 'negative' ? '#ff6467' : '#90a1b9';
        const bg = trend === 'positive' ? 'rgba(0, 212, 146, 0.08)' : trend === 'negative' ? 'rgba(255, 100, 103, 0.08)' : 'rgba(255, 255, 255, 0.04)';
        return (
          <Tag color={bg} style={{ border: 'none', color, fontFamily: 'monospace', fontWeight: 600, margin: 0 }}>
            {formatPercentage(pct)}
          </Tag>
        );
      },
    },
    {
      title: 'Volume',
      dataIndex: 'volume',
      key: 'volume',
      align: 'right' as const,
      responsive: ['sm'],
      render: (vol: number) => (
        <Text style={{ color: '#90a1b9', fontFamily: 'monospace' }}>
          {vol.toLocaleString()}
        </Text>
      ),
    },
    {
      title: 'P/E',
      dataIndex: 'peRatio',
      key: 'peRatio',
      align: 'right' as const,
      responsive: ['sm'],
      render: (pe: number | null) => (
        <Text style={{ color: '#90a1b9', fontFamily: 'monospace' }}>
          {pe !== null ? pe.toFixed(1) : '—'}
        </Text>
      ),
    },
    {
      title: 'Watch',
      key: 'watch',
      align: 'center' as const,
      render: (_: unknown, record: MockSecurity) => {
        const isWatched = watchedSymbols.has(record.symbol);
        return (
          <Button
            type="text"
            icon={isWatched ? <StarFilled style={{ color: '#faad14' }} /> : <StarOutlined style={{ color: '#45556c' }} />}
            onClick={(e) => toggleWatch(record.symbol, e)}
            style={{ padding: 0, height: 'auto' }}
            aria-pressed={isWatched}
            aria-label={
              isWatched
                ? `Remove ${record.symbol.split('.')[0]} from watchlist`
                : `Add ${record.symbol.split('.')[0]} to watchlist`
            }
          />
        );
      },
    },
  ];

  return (
    <div style={{ color: '#e2e8f0' }}>
      {/* Title & Stats Summary */}
      <div style={{ marginBottom: '24px', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '16px' }}>
        <div>
          <Title level={2} style={{ color: '#f1f5f9', margin: 0, fontWeight: 600 }}>
            Browse Securities
          </Title>
          <Text style={{ color: '#90a1b9', fontSize: '13px' }}>
            {filteredSecurities.length} securities listed on Colombo Stock Exchange
          </Text>
        </div>
      </div>

      {/* Filter Toolbar */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: '16px',
          marginBottom: '20px',
          padding: '12px 16px',
          backgroundColor: '#0b0e13',
          borderRadius: '8px',
          border: '1px solid rgba(255, 255, 255, 0.04)',
        }}
      >
        <Space size={16} wrap>
          {/* Segmented Filter */}
          <Segmented
            options={['All', 'Gainers', 'Losers', 'Most Active']}
            value={activeTab}
            onChange={(val) => setActiveTab(val as string)}
            style={{
              backgroundColor: '#070a0e',
              color: '#90a1b9',
              padding: '2px',
            }}
          />

          {/* Search Input inside filters */}
          <Input
            placeholder="Quick search symbol..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            style={{
              width: '180px',
              backgroundColor: '#070a0e',
              borderColor: 'rgba(255,255,255,0.06)',
              borderRadius: '4px',
              color: '#e2e8f0',
              fontSize: '12px',
            }}
          />
        </Space>

        <Space size={12} wrap>
          {/* Sector Select */}
          <Select
            value={selectedSector}
            onChange={setSelectedSector}
            style={{ width: 160 }}
            dropdownStyle={{ backgroundColor: '#12131f' }}
            options={sectors.map((sec) => ({ label: sec, value: sec }))}
          />

          {/* Market Cap Category Select */}
          <Select
            value={selectedCap}
            onChange={setSelectedCap}
            style={{ width: 140 }}
            dropdownStyle={{ backgroundColor: '#12131f' }}
            options={[
              { label: 'All Capitalisations', value: 'All' },
              { label: 'Large Cap', value: 'Large' },
              { label: 'Mid Cap', value: 'Mid' },
              { label: 'Small Cap', value: 'Small' },
            ]}
          />
        </Space>
      </div>

      {/* Main Table */}
      <div
        style={{
          backgroundColor: '#0b0e13',
          borderRadius: '8px',
          border: '1px solid rgba(255, 255, 255, 0.04)',
          overflow: 'hidden',
        }}
      >
        <Table
          columns={columns}
          dataSource={filteredSecurities}
          rowKey="symbol"
          onRow={(record) => ({
            onClick: () => handleRowClick(record),
            style: { cursor: 'pointer' },
          })}
          pagination={{
            pageSize: 10,
            showSizeChanger: false,
            style: { margin: '16px 20px', color: '#90a1b9' },
          }}
        />
      </div>

      {/* Sliding Drawer for OHLC Details */}
      <Drawer
        title={
          selectedSecurity && (
            <div style={{ color: '#e2e8f0' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span style={{ fontSize: '18px', fontWeight: 700 }}>
                  {selectedSecurity.symbol.split('.')[0]}
                </span>
                <Tag color={selectedSecurity.change >= 0 ? 'rgba(0, 212, 146, 0.08)' : 'rgba(255, 100, 103, 0.08)'} style={{ border: 'none', color: selectedSecurity.change >= 0 ? '#00d492' : '#ff6467' }}>
                  {formatPercentage(selectedSecurity.changePct)}
                </Tag>
              </div>
              <div style={{ fontSize: '11px', color: '#64748b', fontWeight: 400, marginTop: '2px' }}>
                {selectedSecurity.name}
              </div>
            </div>
          )
        }
        placement="right"
        width={isMobile ? '100%' : 540}
        onClose={() => setDrawerOpen(false)}
        open={drawerOpen}
        headerStyle={{ borderBottom: '1px solid rgba(255,255,255,0.04)', padding: '16px 24px' }}
        bodyStyle={{ padding: '24px 24px 40px 24px', backgroundColor: '#0a0d14' }}
      >
        {drawerOpen && selectedSecurity && (
          <Space direction="vertical" size={24} style={{ width: '100%' }}>
            {/* Quick Stats Grid */}
            <div
              style={{
                backgroundColor: '#0b0e13',
                padding: '16px',
                borderRadius: '8px',
                border: '1px solid rgba(255, 255, 255, 0.04)',
              }}
            >
              <Row gutter={[16, 16]}>
                <Col span={12}>
                  <Statistic
                    title={<span style={{ color: '#64748b', fontSize: '11px' }}>LAST PRICE</span>}
                    value={formatLKR(selectedSecurity.price)}
                    valueStyle={{ color: '#f1f5f9', fontSize: '16px', fontWeight: 700, fontFamily: 'monospace' }}
                  />
                </Col>
                <Col span={12}>
                  <Statistic
                    title={<span style={{ color: '#64748b', fontSize: '11px' }}>CHANGE</span>}
                    value={formatSigned(selectedSecurity.change, 2)}
                    valueStyle={{
                      color: selectedSecurity.change >= 0 ? '#00d492' : '#ff6467',
                      fontSize: '16px',
                      fontWeight: 700,
                      fontFamily: 'monospace',
                    }}
                  />
                </Col>
                <Col span={12}>
                  <Statistic
                    title={<span style={{ color: '#64748b', fontSize: '11px' }}>VOLUME TRADED</span>}
                    value={selectedSecurity.volume.toLocaleString()}
                    valueStyle={{ color: '#90a1b9', fontSize: '14px', fontFamily: 'monospace' }}
                  />
                </Col>
                <Col span={12}>
                  <Statistic
                    title={<span style={{ color: '#64748b', fontSize: '11px' }}>P/E RATIO</span>}
                    value={selectedSecurity.peRatio !== null ? selectedSecurity.peRatio.toFixed(2) : '—'}
                    valueStyle={{ color: '#90a1b9', fontSize: '14px', fontFamily: 'monospace' }}
                  />
                </Col>
              </Row>
            </div>

            {/* Recharts Candlestick Chart */}
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                <span style={{ fontSize: '12px', fontWeight: 600, color: '#90a1b9', display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <AreaChartOutlined /> 30-Day OHLC Trading Performance
                </span>
                <span style={{ fontSize: '10px', color: '#64748b' }}>EOD DELAYED DATA</span>
              </div>
              <div
                style={{
                  backgroundColor: '#0b0e13',
                  padding: '16px 8px 8px 8px',
                  borderRadius: '8px',
                  border: '1px solid rgba(255, 255, 255, 0.04)',
                }}
              >
                <CandlestickChart data={MOCK_OHLC_DATA.DEFAULT} />
              </div>
            </div>

            {/* Detailed Security Information */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              <span style={{ fontSize: '12px', fontWeight: 600, color: '#90a1b9' }}>Company Profile</span>
              <Paragraph style={{ color: '#64748b', fontSize: '12px', lineHeight: '1.6', margin: 0 }}>
                {selectedSecurity.name} is a leading enterprise in the Sri Lankan Colombo Stock Exchange (CSE) under the {selectedSecurity.sector} sector. Cap category is {selectedSecurity.capCategory}. It continues to form a foundational component in indices calculation and market momentum.
              </Paragraph>
            </div>

            {/* Watchlist Actions inside Drawer */}
            <div style={{ display: 'flex', gap: '12px', marginTop: '8px' }}>
              <Button
                type="primary"
                ghost
                icon={watchedSymbols.has(selectedSecurity.symbol) ? <CheckOutlined /> : <PlusOutlined />}
                onClick={(e) => toggleWatch(selectedSecurity.symbol, e)}
                style={{ flex: 1, borderColor: '#722ed1', color: '#a78bfa' }}
              >
                {watchedSymbols.has(selectedSecurity.symbol) ? 'Remove from Watchlist' : 'Add to Watchlist'}
              </Button>
            </div>
          </Space>
        )}
      </Drawer>
    </div>
  );
};

export default Markets;
