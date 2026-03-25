/**
 * OpenClaw 配置管理
 */

import type { Env, OpenClawConfig } from '../types'

export function loadConfig(env: Env): OpenClawConfig {
  return {
    GATEWAY_URL: env.OPENCLAW_GATEWAY_URL || 'ws://localhost:18789',
    AUTH_TOKEN: env.OPENCLAW_AUTH_TOKEN || '',
    DEVICE_ID: env.OPENCLAW_DEVICE_ID || 'cloudlink-forum',
    ENABLED_CHANNELS: (env.OPENCLAW_CHANNELS || '').split(',').filter(Boolean),
    DEFAULT_THINKING: env.OPENCLAW_THINKING || 'medium',
    RATE_LIMIT: {
      maxMessages: parseInt(env.OPENCLAW_RATE_LIMIT || '100'),
      perSeconds: parseInt(env.OPENCLAW_RATE_WINDOW || '60')
    }
  }
}

export function validateConfig(config: OpenClawConfig): boolean {
  if (!config.GATEWAY_URL) {
    console.error('OPENCLAW_GATEWAY_URL is required')
    return false
  }
  
  if (!config.AUTH_TOKEN) {
    console.error('OPENCLAW_AUTH_TOKEN is required')
    return false
  }
  
  if (!config.DEVICE_ID) {
    console.error('OPENCLAW_DEVICE_ID is required')
    return false
  }
  
  return true
}