import { Button, Space, Typography } from "antd";

const { Title } = Typography;

export function Portfolio() {
  return (
    <Space direction="vertical" size="middle">
      <Title level={3} style={{ color: "#ffffff", margin: 0 }}>
        Portfolio
      </Title>
      <Space size="small" style={{ marginTop: 12 }}>
        <Button>Deposit Funds</Button>
        <Button>Withdraw Cash</Button>
        <Button>Export Statement</Button>
      </Space>
    </Space>
  );
}

export default Portfolio;
