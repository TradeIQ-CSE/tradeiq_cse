import { Button, Space, Typography } from "antd";

const { Title } = Typography;

export function Orders() {
  return (
    <Space direction="vertical" size="middle">
      <Title level={3} style={{ color: "#ffffff", margin: 0 }}>
        Trades
      </Title>
      <Space size="small" style={{ marginTop: 12 }}>
        <Button>Place Buy Order</Button>
        <Button>Place Sell Order</Button>
        <Button>Cancel Pending Orders</Button>
      </Space>
    </Space>
  );
}

export default Orders;
