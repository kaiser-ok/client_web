/**
 * LLM 設定類型
 * 共用於所有需要 LLM 的功能
 */

// LLM 提供者設定
export interface LLMProviderConfig {
  type: 'vllm' | 'openrouter' | 'openai'  // 提供者類型
  baseUrl: string                          // API 位址
  model: string                            // 模型名稱
  apiKey?: string                          // API Key (OpenRouter/OpenAI 需要)
}

// LLM 設定
export interface LLMConfig {
  version: string
  updatedAt: string
  updatedBy: string

  // Primary LLM
  primary: LLMProviderConfig

  // Secondary LLM (備援)
  secondary?: LLMProviderConfig
  useSecondaryOnFailure: boolean  // Primary 失敗時使用 Secondary

  // 通用參數
  defaultTemperature: number
  defaultMaxTokens: number
}

// 預設 LLM 設定
export const DEFAULT_LLM_CONFIG: LLMConfig = {
  version: '1.1.0',
  updatedAt: new Date().toISOString(),
  updatedBy: 'system',

  primary: {
    type: 'openrouter',
    baseUrl: 'https://openrouter.ai/api',
    model: 'gpt-oss-20b',
    apiKey: process.env.OPENROUTER_API_KEY || process.env.OPENAI_API_KEY || '',
  },

  secondary: {
    type: 'vllm',
    baseUrl: 'http://192.168.30.46:8000',
    model: '/models/gpt-oss-120b',
  },
  useSecondaryOnFailure: true,

  defaultTemperature: 0.2,
  defaultMaxTokens: 2000,
}

// SystemConfig 的 key
export const LLM_CONFIG_KEY = 'llm_config'
