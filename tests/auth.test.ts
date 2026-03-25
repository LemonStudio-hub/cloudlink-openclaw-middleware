/**
 * 认证系统测试
 */

import { describe, it, expect, beforeEach, vi } from 'vitest'
import { TokenGenerator, TokenValidator, TokenManager, DeviceManager, SessionManager, AuthManager } from '../src/middleware/openclaw/auth'

// Mock 环境
const mockEnv = {
  DB: {
    prepare: vi.fn()
  }
} as any

describe('TokenGenerator', () => {
  describe('generateAccessToken', () => {
    it('应该生成有效的访问令牌', async () => {
      const token = await TokenGenerator.generateAccessToken({
        deviceId: 'device-1',
        userId: 'user-1',
        scopes: ['read', 'write']
      }, 3600000)

      expect(token.type).toBe('access')
      expect(token.deviceId).toBe('device-1')
      expect(token.userId).toBe('user-1')
      expect(token.scopes).toEqual(['read', 'write'])
      expect(token.expiresAt).toBeGreaterThan(Date.now())
    })
  })

  describe('generateRefreshToken', () => {
    it('应该生成有效的刷新令牌', async () => {
      const token = await TokenGenerator.generateRefreshToken({
        deviceId: 'device-1',
        userId: 'user-1'
      }, 604800000)

      expect(token.type).toBe('refresh')
      expect(token.deviceId).toBe('device-1')
      expect(token.userId).toBe('user-1')
      expect(token.scopes).toEqual(['refresh'])
    })
  })

  describe('encodeToken & decodeToken', () => {
    it('应该正确编码和解码令牌', async () => {
      const originalToken = await TokenGenerator.generateAccessToken({
        deviceId: 'device-1',
        userId: 'user-1',
        scopes: ['read', 'write']
      }, 3600000)

      const encoded = TokenGenerator.encodeToken(originalToken)
      const decoded = TokenGenerator.decodeToken(encoded)

      expect(decoded).not.toBeNull()
      expect(decoded!.id).toBe(originalToken.id)
      expect(decoded!.type).toBe(originalToken.type)
      expect(decoded!.deviceId).toBe(originalToken.deviceId)
    })

    it('应该拒绝无效的编码令牌', () => {
      const decoded = TokenGenerator.decodeToken('invalid_token')
      expect(decoded).toBeNull()
    })
  })

  describe('isTokenValid', () => {
    it('应该验证未过期的令牌', async () => {
      const token = await TokenGenerator.generateAccessToken({
        deviceId: 'device-1',
        userId: 'user-1',
        scopes: ['read']
      }, 3600000)

      expect(TokenGenerator.isTokenValid(token)).toBe(true)
    })

    it('应该拒绝过期的令牌', async () => {
      const token = await TokenGenerator.generateAccessToken({
        deviceId: 'device-1',
        userId: 'user-1',
        scopes: ['read']
      }, -1000) // 已过期

      expect(TokenGenerator.isTokenValid(token)).toBe(false)
    })
  })
})

describe('TokenValidator', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('validateAccessToken', () => {
    it('应该验证有效的访问令牌', async () => {
      const token = await TokenGenerator.generateAccessToken({
        deviceId: 'device-1',
        userId: 'user-1',
        scopes: ['read', 'write']
      }, 3600000)

      const encoded = TokenGenerator.encodeToken(token)

      // Mock 数据库查询
      mockEnv.DB.prepare.mockReturnValue({
        first: vi.fn().mockResolvedValue(null)
      })

      const result = await TokenValidator.validateAccessToken(encoded, mockEnv)

      expect(result.valid).toBe(true)
      expect(result.token).toBeDefined()
      expect(result.token!.id).toBe(token.id)
    })

    it('应该拒绝无效的编码令牌', async () => {
      const result = await TokenValidator.validateAccessToken('invalid_token', mockEnv)

      expect(result.valid).toBe(false)
      expect(result.error).toBe('Invalid token format')
    })

    it('应该拒绝错误的令牌类型', async () => {
      const token = await TokenGenerator.generateRefreshToken({
        deviceId: 'device-1',
        userId: 'user-1'
      }, 604800000)

      const encoded = TokenGenerator.encodeToken(token)

      const result = await TokenValidator.validateAccessToken(encoded, mockEnv)

      expect(result.valid).toBe(false)
      expect(result.error).toBe('Token must be an access token')
    })

    it('应该拒绝过期的令牌', async () => {
      const token = await TokenGenerator.generateAccessToken({
        deviceId: 'device-1',
        userId: 'user-1',
        scopes: ['read']
      }, -1000)

      const encoded = TokenGenerator.encodeToken(token)

      const result = await TokenValidator.validateAccessToken(encoded, mockEnv)

      expect(result.valid).toBe(false)
      expect(result.error).toBe('Token has expired')
    })
  })

  describe('validateDeviceToken', () => {
    it('应该验证有效的设备令牌', async () => {
      const token = await TokenGenerator.generateDeviceToken({
        deviceId: 'device-1',
        name: 'Test Device',
        type: 'mobile'
      }, 31536000000)

      const encoded = TokenGenerator.encodeToken(token)

      // Mock 设备查询
      mockEnv.DB.prepare.mockReturnValue({
        first: vi.fn().mockResolvedValue({
          id: 'device-1',
          name: 'Test Device',
          status: 'active'
        })
      })

      const result = await TokenValidator.validateDeviceToken(encoded, mockEnv)

      expect(result.valid).toBe(true)
    })

    it('应该拒绝非活跃设备', async () => {
      const token = await TokenGenerator.generateDeviceToken({
        deviceId: 'device-1',
        name: 'Test Device',
        type: 'mobile'
      }, 31536000000)

      const encoded = TokenGenerator.encodeToken(token)

      // Mock 非活跃设备查询
      mockEnv.DB.prepare.mockReturnValue({
        first: vi.fn().mockResolvedValue({
          id: 'device-1',
          name: 'Test Device',
          status: 'inactive'
        })
      })

      const result = await TokenValidator.validateDeviceToken(encoded, mockEnv)

      expect(result.valid).toBe(false)
      expect(result.error).toBe('Device is not active')
    })
  })
})

describe('TokenManager', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('issueAccessToken', () => {
    it('应该颁发访问令牌', async () => {
      const token = await TokenManager.issueAccessToken({
        deviceId: 'device-1',
        userId: 'user-1',
        scopes: ['read', 'write']
      }, 3600000)

      expect(token).toBeDefined()
      expect(typeof token).toBe('string')
    })

    describe('issueRefreshToken', () => {
      it('应该颁发刷新令牌', async () => {
        const token = await TokenManager.issueRefreshToken({
          deviceId: 'device-1',
          userId: 'user-1'
        }, 604800000)

        expect(token).toBeDefined()
        expect(typeof token).toBe('string')
      })
    })

    describe('refreshAccessToken', () => {
      it('应该刷新访问令牌', async () => {
        const oldRefreshToken = await TokenManager.issueRefreshToken({
          deviceId: 'device-1',
          userId: 'user-1'
        }, 604800000)

        // Mock 数据库操作
        mockEnv.DB.prepare.mockReturnValue({
          first: vi.fn().mockResolvedValue(null),
          run: vi.fn().mockResolvedValue({ success: true })
        })

        const result = await TokenManager.refreshAccessToken(oldRefreshToken, 3600000, mockEnv)

        expect(result).not.toBeNull()
        expect(result!.accessToken).toBeDefined()
        expect(result!.refreshToken).toBeDefined()
        expect(result!.accessToken).not.toBe(oldRefreshToken)
      })

      it('应该拒绝无效的刷新令牌', async () => {
        const result = await TokenManager.refreshAccessToken('invalid_token', 3600000, mockEnv)

        expect(result).toBeNull()
      })
    })
  })
})

describe('DeviceManager', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('registerDevice', () => {
    it('应该注册新设备', async () => {
      mockEnv.DB.prepare.mockReturnValue({
        run: vi.fn().mockResolvedValue({ success: true })
      })

      const result = await DeviceManager.registerDevice({
        deviceId: 'device-1',
        name: 'Test Device',
        type: 'mobile',
        userId: 'user-1'
      }, mockEnv)

      expect(result).not.toBeNull()
      expect(result!.id).toBe('device-1')
      expect(result!.name).toBe('Test Device')
      expect(result!.status).toBe('active')
    })
  })

  describe('verifyDevice', () => {
    it('应该验证活跃设备', async () => {
      mockEnv.DB.prepare.mockReturnValue({
        first: vi.fn().mockResolvedValue({
          id: 'device-1',
          name: 'Test Device',
          status: 'active',
          last_seen: Date.now()
        }),
        run: vi.fn().mockResolvedValue({ success: true })
      })

      const result = await DeviceManager.verifyDevice('device-1', mockEnv)

      expect(result.valid).toBe(true)
      expect(result.device).toBeDefined()
      expect(result.device!.status).toBe('active')
    })

    it('应该拒绝不存在的设备', async () => {
      mockEnv.DB.prepare.mockReturnValue({
        first: vi.fn().mockResolvedValue(null)
      })

      const result = await DeviceManager.verifyDevice('device-1', mockEnv)

      expect(result.valid).toBe(false)
    })
  })

  describe('revokeDevice', () => {
    it('应该撤销设备', async () => {
      mockEnv.DB.prepare.mockReturnValue({
        run: vi.fn().mockResolvedValue({ success: true })
      })

      const result = await DeviceManager.revokeDevice('device-1', mockEnv)

      expect(result).toBe(true)
    })
  })
})

describe('SessionManager', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('createSession', () => {
    it('应该创建新会话', async () => {
      mockEnv.DB.prepare.mockReturnValue({
        first: vi.fn().mockResolvedValue({ count: 0 }),
        run: vi.fn().mockResolvedValue({ success: true })
      })

      const result = await SessionManager.createSession({
        deviceId: 'device-1',
        userId: 'user-1'
      }, 86400000, 5, mockEnv)

      expect(result).not.toBeNull()
      expect(result!.deviceId).toBe('device-1')
      expect(result!.userId).toBe('user-1')
      expect(result!.token).toBeDefined()
      expect(result!.refreshToken).toBeDefined()
    })

    it('应该在达到最大会话数时删除旧会话', async () => {
      mockEnv.DB.prepare
        .mockReturnValueOnce({
          first: vi.fn().mockResolvedValue({ count: 5 })
        })
        .mockReturnValueOnce({
          run: vi.fn().mockResolvedValue({ success: true })
        })
        .mockReturnValueOnce({
          run: vi.fn().mockResolvedValue({ success: true })
        })

      const result = await SessionManager.createSession({
        deviceId: 'device-1',
        userId: 'user-1'
      }, 86400000, 5, mockEnv)

      expect(result).not.toBeNull()
    })
  })

  describe('validateSession', () => {
    it('应该验证有效会话', async () => {
      mockEnv.DB.prepare.mockReturnValue({
        first: vi.fn().mockResolvedValue({
          id: 'session-1',
          device_id: 'device-1',
          user_id: 'user-1',
          token: 'access_token',
          refresh_token: 'refresh_token',
          expires_at: Date.now() + 86400000,
          last_activity: Date.now()
        }),
        run: vi.fn().mockResolvedValue({ success: true })
      })

      const result = await SessionManager.validateSession('session-1', mockEnv)

      expect(result.valid).toBe(true)
      expect(result.session).toBeDefined()
    })

    it('应该拒绝过期会话', async () => {
      mockEnv.DB.prepare.mockReturnValue({
        first: vi.fn().mockResolvedValue({
          id: 'session-1',
          device_id: 'device-1',
          user_id: 'user-1',
          token: 'access_token',
          refresh_token: 'refresh_token',
          expires_at: Date.now() - 1000, // 已过期
          last_activity: Date.now()
        }),
        run: vi.fn().mockResolvedValue({ success: true })
      })

      const result = await SessionManager.validateSession('session-1', mockEnv)

      expect(result.valid).toBe(false)
    })
  })

  describe('terminateSession', () => {
    it('应该终止会话', async () => {
      mockEnv.DB.prepare.mockReturnValue({
        run: vi.fn().mockResolvedValue({ success: true })
      })

      const result = await SessionManager.terminateSession('session-1', mockEnv)

      expect(result).toBe(true)
    })
  })
})

describe('AuthManager', () => {
  let authManager: AuthManager

  beforeEach(() => {
    vi.clearAllMocks()
    authManager = new AuthManager()
  })

  describe('createDevice', () => {
    it('应该创建设备并返回设备令牌', async () => {
      mockEnv.DB.prepare.mockReturnValue({
        run: vi.fn().mockResolvedValue({ success: true })
      })

      const result = await authManager.createDevice({
        deviceId: 'device-1',
        name: 'Test Device',
        type: 'mobile',
        userId: 'user-1'
      }, mockEnv)

      expect(result.success).toBe(true)
      expect(result.deviceToken).toBeDefined()
    })

    it('应该在失败时返回错误', async () => {
      mockEnv.DB.prepare.mockReturnValue({
        run: vi.fn().mockRejectedValue(new Error('Database error'))
      })

      const result = await authManager.createDevice({
        deviceId: 'device-1',
        name: 'Test Device',
        type: 'mobile',
        userId: 'user-1'
      }, mockEnv)

      expect(result.success).toBe(false)
      expect(result.error).toBeDefined()
    })
  })

  describe('authenticateDevice', () => {
    it('应该验证设备并创建会话', async () => {
      mockEnv.DB.prepare
        .mockReturnValueOnce({
          first: vi.fn().mockResolvedValue({
            id: 'device-1',
            name: 'Test Device',
            status: 'active'
          }),
          run: vi.fn().mockResolvedValue({ success: true })
        })
        .mockReturnValueOnce({
          first: vi.fn().mockResolvedValue({ count: 0 }),
          run: vi.fn().mockResolvedValue({ success: true })
        })

      const result = await authManager.authenticateDevice('device-1', mockEnv)

      expect(result.success).toBe(true)
      expect(result.session).toBeDefined()
    })
  })

  describe('validateRequest', () => {
    it('应该验证有效的访问令牌', async () => {
      const token = await TokenManager.issueAccessToken({
        deviceId: 'device-1',
        userId: 'user-1',
        scopes: ['read', 'write']
      }, 3600000)

      mockEnv.DB.prepare.mockReturnValue({
        first: vi.fn().mockResolvedValue(null)
      })

      const result = await authManager.validateRequest(token, mockEnv)

      expect(result.valid).toBe(true)
      expect(result.userId).toBe('user-1')
      expect(result.deviceId).toBe('device-1')
    })

    it('应该拒绝无效的访问令牌', async () => {
      const result = await authManager.validateRequest('invalid_token', mockEnv)

      expect(result.valid).toBe(false)
      expect(result.error).toBeDefined()
    })
  })

  describe('refresh', () => {
    it('应该刷新令牌', async () => {
      const refreshToken = await TokenManager.issueRefreshToken({
        deviceId: 'device-1',
        userId: 'user-1'
      }, 604800000)

      mockEnv.DB.prepare.mockReturnValue({
        first: vi.fn().mockResolvedValue(null),
        run: vi.fn().mockResolvedValue({ success: true })
      })

      const result = await authManager.refresh(refreshToken, mockEnv)

      expect(result.success).toBe(true)
      expect(result.accessToken).toBeDefined()
      expect(result.refreshToken).toBeDefined()
    })
  })

  describe('revokeDevice', () => {
    it('应该撤销设备', async () => {
      mockEnv.DB.prepare.mockReturnValue({
        run: vi.fn().mockResolvedValue({ success: true })
      })

      const result = await authManager.revokeDevice('device-1', mockEnv)

      expect(result).toBe(true)
    })
  })
})