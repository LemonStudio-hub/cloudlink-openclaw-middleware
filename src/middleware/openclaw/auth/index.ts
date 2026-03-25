/**
 * 认证系统
 * 负责令牌认证、设备配对和会话管理
 */

import type { Env } from '../../../types'

// 令牌类型
export interface Token {
  id: string
  type: 'access' | 'refresh' | 'device'
  userId?: string
  deviceId: string
  scopes: string[]
  expiresAt: number
  createdAt: number
}

// 设备信息
export interface Device {
  id: string
  name: string
  type: string
  userId?: string
  status: 'active' | 'inactive' | 'revoked'
  lastSeen: number
  createdAt: number
  updatedAt: number
}

// 会话信息
export interface Session {
  id: string
  userId?: string
  deviceId: string
  token: string
  refreshToken?: string
  expiresAt: number
  lastActivity: number
  createdAt: number
  updatedAt: number
}

// 认证配置
export interface AuthConfig {
  ACCESS_TOKEN_TTL: number
  REFRESH_TOKEN_TTL: number
  DEVICE_TOKEN_TTL: number
  SESSION_TTL: number
  MAX_SESSIONS_PER_DEVICE: number
}

// 令牌生成器
export class TokenGenerator {
  static async generateAccessToken(data: { deviceId: string; userId?: string; scopes: string[] }, ttl: number): Promise<Token> {
    return {
      id: await this.generateTokenId(),
      type: 'access',
      userId: data.userId,
      deviceId: data.deviceId,
      scopes: data.scopes,
      expiresAt: Date.now() + ttl,
      createdAt: Date.now()
    }
  }

  static async generateRefreshToken(data: { deviceId: string; userId?: string }, ttl: number): Promise<Token> {
    return {
      id: await this.generateTokenId(),
      type: 'refresh',
      userId: data.userId,
      deviceId: data.deviceId,
      scopes: ['refresh'],
      expiresAt: Date.now() + ttl,
      createdAt: Date.now()
    }
  }

  static async generateDeviceToken(data: { deviceId: string; name: string; type: string }, ttl: number): Promise<Token> {
    return {
      id: await this.generateTokenId(),
      type: 'device',
      deviceId: data.deviceId,
      scopes: ['device'],
      expiresAt: Date.now() + ttl,
      createdAt: Date.now()
    }
  }

  private static async generateTokenId(): Promise<string> {
    const randomBytes = new Uint8Array(32)
    crypto.getRandomValues(randomBytes)
    return Array.from(randomBytes, b => b.toString(16).padStart(2, '0')).join('')
  }

  static encodeToken(token: Token): string {
    const payload = {
      id: token.id,
      type: token.type,
      userId: token.userId,
      deviceId: token.deviceId,
      scopes: token.scopes,
      exp: token.expiresAt,
      iat: token.createdAt
    }
    return btoa(JSON.stringify(payload))
  }

  static decodeToken(encoded: string): Token | null {
    try {
      const payload = JSON.parse(atob(encoded))
      return {
        id: payload.id,
        type: payload.type,
        userId: payload.userId,
        deviceId: payload.deviceId,
        scopes: payload.scopes,
        expiresAt: payload.exp,
        createdAt: payload.iat
      }
    } catch {
      return null
    }
  }

  static isTokenValid(token: Token): boolean {
    return token.expiresAt > Date.now()
  }
}

// 令牌验证器
export class TokenValidator {
  static async validateAccessToken(encoded: string, env: Env): Promise<{ valid: boolean; token?: Token; error?: string }> {
    const token = TokenGenerator.decodeToken(encoded)
    
    if (!token) {
      return { valid: false, error: 'Invalid token format' }
    }

    if (token.type !== 'access') {
      return { valid: false, error: 'Token must be an access token' }
    }

    if (!TokenGenerator.isTokenValid(token)) {
      return { valid: false, error: 'Token has expired' }
    }

    // 检查令牌是否被撤销
    const isRevoked = await this.isTokenRevoked(token.id, env)
    if (isRevoked) {
      return { valid: false, error: 'Token has been revoked' }
    }

    return { valid: true, token }
  }

  static async validateRefreshToken(encoded: string, env: Env): Promise<{ valid: boolean; token?: Token; error?: string }> {
    const token = TokenGenerator.decodeToken(encoded)
    
    if (!token) {
      return { valid: false, error: 'Invalid token format' }
    }

    if (token.type !== 'refresh') {
      return { valid: false, error: 'Token must be a refresh token' }
    }

    if (!TokenGenerator.isTokenValid(token)) {
      return { valid: false, error: 'Token has expired' }
    }

    return { valid: true, token }
  }

  static async validateDeviceToken(encoded: string, env: Env): Promise<{ valid: boolean; token?: Token; error?: string }> {
    const token = TokenGenerator.decodeToken(encoded)
    
    if (!token) {
      return { valid: false, error: 'Invalid token format' }
    }

    if (token.type !== 'device') {
      return { valid: false, error: 'Token must be a device token' }
    }

    if (!TokenGenerator.isTokenValid(token)) {
      return { valid: false, error: 'Token has expired' }
    }

    // 检查设备是否有效
    const device = await this.getDevice(token.deviceId, env)
    if (!device || device.status !== 'active') {
      return { valid: false, error: 'Device is not active' }
    }

    return { valid: true, token }
  }

  private static async isTokenRevoked(tokenId: string, env: Env): Promise<boolean> {
    try {
      const result = await env.DB.prepare(
        'SELECT revoked FROM revoked_tokens WHERE token_id = ?'
      ).bind(tokenId).first()
      
      return !!result
    } catch {
      return false
    }
  }

  private static async getDevice(deviceId: string, env: Env): Promise<Device | null> {
    try {
      const result = await env.DB.prepare(
        'SELECT * FROM devices WHERE id = ?'
      ).bind(deviceId).first() as any
      
      if (!result) return null

      return {
        id: result.id,
        name: result.name,
        type: result.type,
        userId: result.user_id,
        status: result.status,
        lastSeen: result.last_seen,
        createdAt: result.created_at,
        updatedAt: result.updated_at
      }
    } catch {
      return null
    }
  }
}

// 令牌管理器
export class TokenManager {
  static async issueAccessToken(data: { deviceId: string; userId?: string; scopes: string[] }, ttl: number): Promise<string> {
    const token = await TokenGenerator.generateAccessToken(data, ttl)
    return TokenGenerator.encodeToken(token)
  }

  static async issueRefreshToken(data: { deviceId: string; userId?: string }, ttl: number): Promise<string> {
    const token = await TokenGenerator.generateRefreshToken(data, ttl)
    return TokenGenerator.encodeToken(token)
  }

  static async refreshAccessToken(refreshToken: string, newTtl: number, env: Env): Promise<{ accessToken: string; refreshToken: string } | null> {
    const validation = await TokenValidator.validateRefreshToken(refreshToken, env)
    
    if (!validation.valid || !validation.token) {
      return null
    }

    const oldToken = validation.token

    // 撤销旧的刷新令牌
    await this.revokeToken(oldToken.id, env)

    // 生成新的令牌对
    const newAccessToken = await this.issueAccessToken({
      deviceId: oldToken.deviceId,
      userId: oldToken.userId,
      scopes: ['read', 'write']
    }, newTtl)

    const newRefreshToken = await this.issueRefreshToken({
      deviceId: oldToken.deviceId,
      userId: oldToken.userId
    }, newTtl)

    return {
      accessToken: newAccessToken,
      refreshToken: newRefreshToken
    }
  }

  static async revokeToken(tokenId: string, env: Env): Promise<boolean> {
    try {
      await env.DB.prepare(
        'INSERT INTO revoked_tokens (token_id, revoked_at) VALUES (?, ?)'
      ).bind(tokenId, Date.now()).run()
      
      return true
    } catch {
      return false
    }
  }
}

// 设备管理器
export class DeviceManager {
  static async registerDevice(data: { deviceId: string; name: string; type: string; userId?: string }, env: Env): Promise<Device | null> {
    try {
      const now = Date.now()
      
      await env.DB.prepare(`
        INSERT INTO devices (id, name, type, user_id, status, last_seen, created_at, updated_at)
        VALUES (?, ?, ?, ?, 'active', ?, ?, ?)
      `).bind(
        data.deviceId,
        data.name,
        data.type,
        data.userId || null,
        now,
        now,
        now
      ).run()

      return {
        id: data.deviceId,
        name: data.name,
        type: data.type,
        userId: data.userId,
        status: 'active',
        lastSeen: now,
        createdAt: now,
        updatedAt: now
      }
    } catch {
      return null
    }
  }

  static async verifyDevice(deviceId: string, env: Env): Promise<{ valid: boolean; device?: Device }> {
    try {
      const result = await env.DB.prepare(
        'SELECT * FROM devices WHERE id = ?'
      ).bind(deviceId).first() as any

      if (!result) {
        return { valid: false }
      }

      const device: Device = {
        id: result.id,
        name: result.name,
        type: result.type,
        userId: result.user_id,
        status: result.status,
        lastSeen: result.last_seen,
        createdAt: result.created_at,
        updatedAt: result.updated_at
      }

      if (device.status !== 'active') {
        return { valid: false, device }
      }

      // 更新最后活跃时间
      await this.updateDeviceLastSeen(deviceId, env)

      return { valid: true, device }
    } catch {
      return { valid: false }
    }
  }

  static async revokeDevice(deviceId: string, env: Env): Promise<boolean> {
    try {
      await env.DB.prepare(
        'UPDATE devices SET status = ?, updated_at = ? WHERE id = ?'
      ).bind('revoked', Date.now(), deviceId).run()
      
      return true
    } catch {
      return false
    }
  }

  static async listDevices(env: Env, userId?: string): Promise<Device[]> {
    try {
      let query = 'SELECT * FROM devices WHERE status = ?'
      const params: any[] = ['active']

      if (userId) {
        query += ' AND user_id = ?'
        params.push(userId)
      }

      const results = await env.DB.prepare(query).bind(...params).all() as any

      return results.map((r: any) => ({
        id: r.id,
        name: r.name,
        type: r.type,
        userId: r.user_id,
        status: r.status,
        lastSeen: r.last_seen,
        createdAt: r.created_at,
        updatedAt: r.updated_at
      }))
    } catch {
      return []
    }
  }

  private static async updateDeviceLastSeen(deviceId: string, env: Env): Promise<void> {
    try {
      await env.DB.prepare(
        'UPDATE devices SET last_seen = ? WHERE id = ?'
      ).bind(Date.now(), deviceId).run()
    } catch {
      // Ignore errors
    }
  }
}

// 会话管理器
export class SessionManager {
  static async createSession(data: { deviceId: string; userId?: string }, ttl: number, maxSessions: number, env: Env): Promise<Session | null> {
    try {
      // 检查会话数量限制
      const sessionCount = await env.DB.prepare(
        'SELECT COUNT(*) as count FROM sessions WHERE device_id = ? AND expires_at > ?'
      ).bind(data.deviceId, Date.now()).first() as any

      if (sessionCount && sessionCount.count >= maxSessions) {
        // 删除最旧的会话
        await env.DB.prepare(`
          DELETE FROM sessions 
          WHERE device_id = ? 
          ORDER BY created_at ASC 
          LIMIT 1
        `).bind(data.deviceId).run()
      }

      // 生成令牌
      const accessToken = await TokenManager.issueAccessToken({
        deviceId: data.deviceId,
        userId: data.userId,
        scopes: ['read', 'write']
      }, ttl)

      const refreshToken = await TokenManager.issueRefreshToken({
        deviceId: data.deviceId,
        userId: data.userId
      }, ttl)

      const now = Date.now()
      const sessionId = `session-${now}-${Math.random().toString(36).substring(2, 9)}`

      await env.DB.prepare(`
        INSERT INTO sessions (id, user_id, device_id, token, refresh_token, expires_at, last_activity, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).bind(
        sessionId,
        data.userId || null,
        data.deviceId,
        accessToken,
        refreshToken,
        now + ttl,
        now,
        now,
        now
      ).run()

      return {
        id: sessionId,
        userId: data.userId,
        deviceId: data.deviceId,
        token: accessToken,
        refreshToken,
        expiresAt: now + ttl,
        lastActivity: now,
        createdAt: now,
        updatedAt: now
      }
    } catch {
      return null
    }
  }

  static async validateSession(sessionId: string, env: Env): Promise<{ valid: boolean; session?: Session }> {
    try {
      const result = await env.DB.prepare(
        'SELECT * FROM sessions WHERE id = ?'
      ).bind(sessionId).first() as any

      if (!result) {
        return { valid: false }
      }

      const session: Session = {
        id: result.id,
        userId: result.user_id,
        deviceId: result.device_id,
        token: result.token,
        refreshToken: result.refresh_token,
        expiresAt: result.expires_at,
        lastActivity: result.last_activity,
        createdAt: result.created_at,
        updatedAt: result.updated_at
      }

      if (session.expiresAt <= Date.now()) {
        await this.terminateSession(sessionId, env)
        return { valid: false }
      }

      // 更新最后活跃时间
      await this.updateSessionActivity(sessionId, env)

      return { valid: true, session }
    } catch {
      return { valid: false }
    }
  }

  static async refreshSession(sessionId: string, newTtl: number, env: Env): Promise<Session | null> {
    const validation = await this.validateSession(sessionId, env)

    if (!validation.valid || !validation.session || !validation.session.refreshToken) {
      return null
    }

    const session = validation.session

    // 刷新令牌
    if (!session.refreshToken) {
      return null
    }

    const tokens = await TokenManager.refreshAccessToken(session.refreshToken, newTtl, env)

    if (!tokens) {
      return null
    }

    // 更新会话
    const now = Date.now()
    await env.DB.prepare(`
      UPDATE sessions 
      SET token = ?, refresh_token = ?, expires_at = ?, last_activity = ?, updated_at = ?
      WHERE id = ?
    `).bind(
      tokens.accessToken,
      tokens.refreshToken,
      now + newTtl,
      now,
      now,
      sessionId
    ).run()

    return {
      ...session,
      token: tokens.accessToken,
      refreshToken: tokens.refreshToken,
      expiresAt: now + newTtl,
      lastActivity: now,
      updatedAt: now
    }
  }

  static async terminateSession(sessionId: string, env: Env): Promise<boolean> {
    try {
      await env.DB.prepare(
        'DELETE FROM sessions WHERE id = ?'
      ).bind(sessionId).run()
      
      return true
    } catch {
      return false
    }
  }

  static async terminateAllSessions(deviceId: string, env: Env): Promise<boolean> {
    try {
      await env.DB.prepare(
        'DELETE FROM sessions WHERE device_id = ?'
      ).bind(deviceId).run()
      
      return true
    } catch {
      return false
    }
  }

  private static async updateSessionActivity(sessionId: string, env: Env): Promise<void> {
    try {
      await env.DB.prepare(
        'UPDATE sessions SET last_activity = ? WHERE id = ?'
      ).bind(Date.now(), sessionId).run()
    } catch {
      // Ignore errors
    }
  }
}

// 认证管理器（整合所有认证功能）
export class AuthManager {
  private config: AuthConfig

  constructor(config?: Partial<AuthConfig>) {
    this.config = {
      ACCESS_TOKEN_TTL: config?.ACCESS_TOKEN_TTL || 3600000, // 1 hour
      REFRESH_TOKEN_TTL: config?.REFRESH_TOKEN_TTL || 604800000, // 7 days
      DEVICE_TOKEN_TTL: config?.DEVICE_TOKEN_TTL || 31536000000, // 1 year
      SESSION_TTL: config?.SESSION_TTL || 86400000, // 1 day
      MAX_SESSIONS_PER_DEVICE: config?.MAX_SESSIONS_PER_DEVICE || 5
    }
  }

  async createDevice(data: { deviceId: string; name: string; type: string; userId?: string }, env: Env): Promise<{ success: boolean; deviceToken?: string; error?: string }> {
    const device = await DeviceManager.registerDevice(data, env)

    if (!device) {
      return { success: false, error: 'Failed to register device' }
    }

    const deviceToken = await TokenManager.issueAccessToken({
      deviceId: data.deviceId,
      userId: data.userId,
      scopes: ['device']
    }, this.config.DEVICE_TOKEN_TTL)

    return { success: true, deviceToken }
  }

  async authenticateDevice(deviceId: string, env: Env): Promise<{ success: boolean; session?: Session; error?: string }> {
    const verification = await DeviceManager.verifyDevice(deviceId, env)

    if (!verification.valid) {
      return { success: false, error: 'Device verification failed' }
    }

    const session = await SessionManager.createSession(
      { deviceId },
      this.config.SESSION_TTL,
      this.config.MAX_SESSIONS_PER_DEVICE,
      env
    )

    if (!session) {
      return { success: false, error: 'Failed to create session' }
    }

    return { success: true, session }
  }

  async validateRequest(accessToken: string, env: Env): Promise<{ valid: boolean; userId?: string; deviceId?: string; error?: string }> {
    const validation = await TokenValidator.validateAccessToken(accessToken, env)

    if (!validation.valid || !validation.token) {
      return { valid: false, error: validation.error || 'Invalid token' }
    }

    const token = validation.token

    return {
      valid: true,
      userId: token.userId,
      deviceId: token.deviceId
    }
  }

  async refresh(refreshToken: string, env: Env): Promise<{ success: boolean; accessToken?: string; refreshToken?: string; error?: string }> {
    const tokens = await TokenManager.refreshAccessToken(refreshToken, this.config.ACCESS_TOKEN_TTL, env)

    if (!tokens) {
      return { success: false, error: 'Failed to refresh token' }
    }

    return { success: true, ...tokens }
  }

  async revokeDevice(deviceId: string, env: Env): Promise<boolean> {
    return await DeviceManager.revokeDevice(deviceId, env)
  }

  async revokeSession(sessionId: string, env: Env): Promise<boolean> {
    return await SessionManager.terminateSession(sessionId, env)
  }
}
