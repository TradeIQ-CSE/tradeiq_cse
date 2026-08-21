import { useState, useMemo } from "react";
import { Table, Space, Button, Select, Typography, message, Segmented, Drawer, Statistic, Tag, Row, Col } from "antd";
import { PlusOutlined, CheckOutlined, AreaChartOutlined } from "@ant-design/icons";
import { marketSecurities, Security } from "../../data/fixtures/market";
import { ohlcData } from "../../data/fixtures/ohlc";
import { CandlestickChart } from "../../components/charts/CandlestickChart";
import { formatSigned, formatPercentage, formatLKR } from "../../utils/format";

const { Title, Text } = Typography;

export function Markets() {
  const [securities, setSecurities] = useState<Security[]>(marketSecurities);
  const [filterTab, setFilterTab] = useState<string>("All");
  const [selectedSector, setSelectedSector] = useState<string | null>(null);
  const [selectedCap, setSelectedCap] = useState<string | null>(null);

  // Drawer state for stock chart detail
  const [selectedSecurity, setSelectedSecurity] = useState<Security | null>(null);
  const [drawerVisible, setDrawerVisible] = useState(false);

  // List of unique sectors for filter dropdown
  const sectors = useMemo(() => {
    const allSectors = securities.map((s) => s.sector);
    return Array.from(new Set(allSectors));
  }, [securities]);

  // Handle Watchlist toggling
  const handleWatchlistToggle = (symbol: string, e: React.MouseEvent) => {
    e.stopPropagation(); // Prevent opening the details drawer
    setSecurities((prev) =>
      prev.map((sec) => {
        if (sec.symbol === symbol) {
          const newState = !sec.inWatchlist;
          message.success(
            newState
              ? `${symbol} added to Watchlist`
              : `${symbol} removed from Watchlist`
          );
          return { ...sec, inWatchlist: newState };
        }
        return sec;
      })
    );
  };

  const handleOpenChart = (security: Security) => {
    setSelectedSecurity(security);
    setDrawerVisible(true);
  };

  // Filter and sort the securities based on active state
  const filteredSecurities = useMemo(() => {
    let result = [...securities];

    // 1. Filter by Tab selection
    if (filterTab === "Gainers") {
      result = result.filter((s) => s.change > 0);
    } else if (filterTab === "Losers") {
      result = result.filter((s) => s.change < 0);
    } else if (filterTab === "Most Active") {
      result = result.sort((a, b) => b.volume - a.volume);
    }

    // 2. Filter by Sector dropdown
    if (selectedSector) {
      result = result.filter((s) => s.sector === selectedSector);
    }

    // 3. Filter by Cap dropdown
    if (selectedCap) {
      result = result.filter((s) => s.cap === selectedCap);
    }

    return result;
  }, [securities, filterTab, selectedSector, selectedCap]);

  // Columns definition matching Figma
  const columns = [
    {
      title: "Symbol",
      key: "symbol",
      render: (_: any, record: Security) => (
        <div
          style={{ display: "flex", flexDirection: "column", cursor: "pointer" }}
          onClick={() => handleOpenChart(record)}
        >
          <Text strong style={{ color: "#722ed1", fontSize: 14 }}>
            {record.symbol}
          </Text>
          <Text style={{ color: "#53647e", fontSize: 12 }}>
            {record.name}
          </Text>
        </div>
      ),
    },
    {
      title: "Sector",
      dataIndex: "sector",
      key: "sector",
      render: (val: string) => <Text style={{ color: "#9aa4b2" }}>{val}</Text>,
    },
    {
      title: "Cap",
      dataIndex: "cap",
      key: "cap",
      render: (val: string) => <Text style={{ color: "#9aa4b2" }}>{val}</Text>,
    },
    {
      title: "Price",
      dataIndex: "price",
      key: "price",
      render: (val: number) => (
        <Text strong style={{ color: "#ffffff" }}>
          {val.toFixed(2)}
        </Text>
      ),
      align: "right" as const,
    },
    {
      title: "Change",
      dataIndex: "change",
      key: "change",
      render: (val: number) => {
        const color = val >= 0 ? "#26a69a" : "#ef5350";
        return (
          <Text strong style={{ color }}>
            {formatSigned(val)}
          </Text>
        );
      },
      align: "right" as const,
    },
    {
      title: "%",
      dataIndex: "changePercent",
      key: "changePercent",
      render: (val: number) => {
        const color = val >= 0 ? "#26a69a" : "#ef5350";
        return (
          <Text strong style={{ color }}>
            {formatPercentage(val)}
          </Text>
        );
      },
      align: "right" as const,
    },
    {
      title: "Volume",
      dataIndex: "volume",
      key: "volume",
      render: (val: number) => (
        <Text style={{ color: "#e6e9f0" }}>{val.toLocaleString()}</Text>
      ),
      align: "right" as const,
    },
    {
      title: "P/E",
      dataIndex: "pe",
      key: "pe",
      render: (val: number) => (
        <Text style={{ color: "#e6e9f0" }}>{val.toFixed(1)}</Text>
      ),
      align: "right" as const,
    },
    {
      title: "Watch",
      key: "watch",
      render: (_: any, record: Security) => {
        const inWatch = record.inWatchlist;
        return (
          <Button
            type="text"
            icon={
              inWatch ? (
                <CheckOutlined style={{ color: "#722ed1" }} />
              ) : (
                <PlusOutlined style={{ color: "#26a69a" }} />
              )
            }
            onClick={(e) => handleWatchlistToggle(record.symbol, e)}
          />
        );
      },
      align: "center" as const,
    },
  ];

  return (
    <Space direction="vertical" size="large" style={{ width: "100%" }}>
      {/* Title Header */}
      <div>
        <Title level={3} style={{ margin: 0, color: "#ffffff" }}>
          Browse Securities
        </Title>
        <Text style={{ color: "#9aa4b2" }}>
          {filteredSecurities.length} securities listed on CSE matching filters
        </Text>
      </div>

      {/* Interactive Filters Ribbon */}
      <div
        style={{
          display: "flex",
          flexWrap: "wrap",
          gap: "12px",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "0 0 8px 0",
        }}
      >
        <Space size="small" style={{ flexWrap: "wrap" }}>
          <Segmented
            options={["All", "Gainers", "Losers", "Most Active"]}
            value={filterTab}
            onChange={(val) => setFilterTab(val as string)}
            style={{ background: "#0f1218", color: "#9aa4b2" }}
          />
        </Space>

        <Space size="small" style={{ flexWrap: "wrap" }}>
          {/* Sector Select */}
          <Select
            placeholder="Select Segment"
            allowClear
            style={{ width: 160 }}
            onChange={(val) => setSelectedSector(val)}
            value={selectedSector}
            dropdownStyle={{ background: "#1b2230" }}
          >
            {sectors.map((sec) => (
              <Select.Option key={sec} value={sec}>
                {sec}
              </Select.Option>
            ))}
          </Select>

          {/* Market Cap Select */}
          <Select
            placeholder="Select Market Cap"
            allowClear
            style={{ width: 160 }}
            onChange={(val) => setSelectedCap(val)}
            value={selectedCap}
            dropdownStyle={{ background: "#1b2230" }}
          >
            <Select.Option value="Large">Large Cap</Select.Option>
            <Select.Option value="Mid">Mid Cap</Select.Option>
            <Select.Option value="Small">Small Cap</Select.Option>
          </Select>
        </Space>
      </div>

      {/* Main Securities Table */}
      <Table
        dataSource={filteredSecurities}
        columns={columns}
        rowKey="symbol"
        pagination={{
          pageSize: 10,
          showSizeChanger: false,
          style: { marginRight: 8 },
        }}
        style={{
          background: "transparent",
        }}
        rowClassName="markets-table-row"
        onRow={(record) => ({
          onClick: () => handleOpenChart(record),
        })}
      />

      {/* Slide-out chart detail drawer */}
      <Drawer
        title={
          selectedSecurity ? (
            <div style={{ display: "flex", flexDirection: "column" }}>
              <span style={{ color: "#ffffff", fontSize: 18 }}>{selectedSecurity.symbol} - {selectedSecurity.name}</span>
              <span style={{ color: "#53647e", fontSize: 13, fontWeight: "normal", marginTop: 2 }}>
                {selectedSecurity.sector} · {selectedSecurity.cap} Cap
              </span>
            </div>
          ) : (
            "Security Analysis"
          )
        }
        placement="right"
        width={window.innerWidth > 768 ? 640 : "100%"}
        onClose={() => setDrawerVisible(false)}
        open={drawerVisible}
        styles={{
          header: { background: "#141922", borderBottom: "1px solid #2a3343" },
          body: { background: "#0a0d14", color: "#e6e9f0", padding: "20px" },
        }}
      >
        {selectedSecurity && (
          <Space direction="vertical" size="large" style={{ width: "100%" }}>
            {/* Quick Metrics */}
            <Row gutter={[16, 16]}>
              <Col span={12}>
                <Statistic
                  title={<span style={{ color: "#9aa4b2" }}>Last Traded Price</span>}
                  value={selectedSecurity.price}
                  formatter={(v) => formatLKR(Number(v))}
                  valueStyle={{ color: "#ffffff", fontWeight: "bold" }}
                />
              </Col>
              <Col span={12}>
                <Statistic
                  title={<span style={{ color: "#9aa4b2" }}>Price Change</span>}
                  value={selectedSecurity.change}
                  formatter={(v) => formatSigned(Number(v))}
                  valueStyle={{
                    color: selectedSecurity.change >= 0 ? "#26a69a" : "#ef5350",
                    fontWeight: "bold",
                  }}
                  suffix={
                    <Tag
                      color={selectedSecurity.change >= 0 ? "success" : "error"}
                      style={{ marginLeft: 8, verticalAlign: "middle" }}
                    >
                      {formatPercentage(selectedSecurity.changePercent)}
                    </Tag>
                  }
                />
              </Col>
            </Row>

            <div style={{ height: "1px", background: "#1c2434", margin: "8px 0" }} />

            {/* Candlestick Chart Wrapper Component */}
            <div>
              <div style={{ display: "flex", alignItems: "center", marginBottom: 16 }}>
                <AreaChartOutlined style={{ color: "#722ed1", marginRight: 8, fontSize: 16 }} />
                <Text strong style={{ color: "#ffffff", fontSize: 15 }}>
                  Daily Candlestick Chart
                </Text>
              </div>
              <CandlestickChart data={ohlcData} height={320} />
            </div>

            <div style={{ height: "1px", background: "#1c2434", margin: "8px 0" }} />

            {/* Additional Security stats */}
            <Row gutter={[16, 16]}>
              <Col span={12}>
                <span style={{ color: "#9aa4b2", display: "block" }}>Volume Traded:</span>
                <Text strong style={{ color: "#ffffff", fontSize: 16 }}>
                  {selectedSecurity.volume.toLocaleString()}
                </Text>
              </Col>
              <Col span={12}>
                <span style={{ color: "#9aa4b2", display: "block" }}>P/E Ratio:</span>
                <Text strong style={{ color: "#ffffff", fontSize: 16 }}>
                  {selectedSecurity.pe.toFixed(1)}
                </Text>
              </Col>
            </Row>
          </Space>
        )}
      </Drawer>
    </Space>
  );
}

export default Markets;
