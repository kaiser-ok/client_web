import { NextAuthOptions } from 'next-auth'
import GoogleProvider from 'next-auth/providers/google'
import CredentialsProvider from 'next-auth/providers/credentials'
import prisma from './prisma'
import { authenticateWithLDAP } from './ldap'
import type { UserRole } from '@/constants/roles'

// 判斷是否使用 HTTPS（用於 cookie 設定）
const useSecureCookies = process.env.NEXTAUTH_URL?.startsWith('https://') ?? false

export const authOptions: NextAuthOptions = {
  // 在 HTTP 環境下禁用 secure cookie 前綴
  useSecureCookies,
  cookies: {
    sessionToken: {
      name: useSecureCookies ? '__Secure-next-auth.session-token' : 'next-auth.session-token',
      options: {
        httpOnly: true,
        sameSite: 'lax',
        path: '/',
        secure: useSecureCookies,
      },
    },
    callbackUrl: {
      name: useSecureCookies ? '__Secure-next-auth.callback-url' : 'next-auth.callback-url',
      options: {
        sameSite: 'lax',
        path: '/',
        secure: useSecureCookies,
      },
    },
    csrfToken: {
      name: useSecureCookies ? '__Host-next-auth.csrf-token' : 'next-auth.csrf-token',
      options: {
        httpOnly: true,
        sameSite: 'lax',
        path: '/',
        secure: useSecureCookies,
      },
    },
  },
  providers: [
    GoogleProvider({
      clientId: process.env.GOOGLE_CLIENT_ID!,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
    }),
    CredentialsProvider({
      id: 'ldap',
      name: 'AD 帳號',
      credentials: {
        username: { label: '帳號', type: 'text', placeholder: '請輸入 AD 帳號' },
        password: { label: '密碼', type: 'password' },
      },
      async authorize(credentials) {
        if (!credentials?.username || !credentials?.password) {
          return null
        }

        const ldapUser = await authenticateWithLDAP(
          credentials.username,
          credentials.password
        )

        if (!ldapUser) {
          return null
        }

        // 建立或更新資料庫使用者
        const dbUser = await prisma.user.upsert({
          where: { email: ldapUser.email },
          update: {
            name: ldapUser.name,
          },
          create: {
            email: ldapUser.email,
            name: ldapUser.name,
            role: 'SUPPORT', // 預設角色
          },
        })

        return {
          id: dbUser.id,
          email: dbUser.email,
          name: dbUser.name,
          role: dbUser.role as UserRole,
        }
      },
    }),
  ],
  callbacks: {
    async signIn({ user, account }) {
      if (account?.provider === 'google') {
        // Create or update user in database, save tokens
        await prisma.user.upsert({
          where: { email: user.email! },
          update: {
            name: user.name,
            image: user.image,
          },
          create: {
            email: user.email!,
            name: user.name,
            image: user.image,
            role: 'SUPPORT', // 預設角色為服務支援
          },
        })
      }
      return true
    },
    async session({ session }) {
      if (session.user) {
        const dbUser = await prisma.user.findUnique({
          where: { email: session.user.email! },
        })
        if (dbUser) {
          session.user.id = dbUser.id
          session.user.role = dbUser.role
        }
      }
      return session
    },
  },
  pages: {
    signIn: '/login',
  },
  session: {
    strategy: 'jwt',
    maxAge: 60 * 24 * 60 * 60, // 60 天
  },
}

declare module 'next-auth' {
  interface Session {
    user: {
      id: string
      email: string
      name?: string | null
      image?: string | null
      role: string
    }
  }
}
