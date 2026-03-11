/** @type {import('next').NextConfig} */
const nextConfig = {
  transpilePackages: ['antd', '@ant-design/icons', '@ant-design/cssinjs'],
  allowedDevOrigins: ['proj.gentrice.net', '192.168.30.202'],
  serverExternalPackages: ['imapflow', 'pino', 'thread-stream', 'mailparser', 'puppeteer', 'ioredis', 'bullmq'],
  experimental: {
    serverActions: {
      bodySizeLimit: '10mb',
    },
  },
}

module.exports = nextConfig
