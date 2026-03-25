/**
 * CloudLink OpenClaw 中间件
 * 连接 OpenClaw AI 助手与云纽论坛的桥梁
 */

import { Hono } from 'hono'
import { cors } from 'hono/cors'
import type { Env } from './types'
import { healthCheck } from './middleware/openclaw/client'
import { OpenClawRouter } from './middleware/openclaw/router'

const app = new Hono<{ Bindings: Env }>()

// CORS 配置
app.use('*', cors())

// 健康检查端点
app.get('/health', healthCheck)

// OpenClaw 中间件端点
app.use('/openclaw/*', async (c, next) => {
  // 初始化 OpenClaw 路由器（在每个请求中初始化，以访问环境变量）
  const openclawRouter = new OpenClawRouter(c.env)
  await openclawRouter.router['/event'](c)
  await next()
})

export default app