/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: false,
  transpilePackages: ['antd', '@ant-design/icons', '@ant-design/cssinjs'],
  allowedDevOrigins: ['proj.gentrice.net', '192.168.30.202'],
  serverExternalPackages: ['imapflow', 'pino', 'thread-stream', 'mailparser', 'puppeteer', 'ioredis', 'bullmq'],
  experimental: {
    serverActions: {
      bodySizeLimit: '10mb',
    },
  },
  async rewrites() {
    return [
      {
        source: '/proj_slack',
        destination: '/api/slack/webhook',
      },
    ]
  },
}

module.exports = nextConfig
