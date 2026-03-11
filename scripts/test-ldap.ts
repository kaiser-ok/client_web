/**
 * LDAP 連線測試腳本
 * 用於偵測 LDAP 設定和帳號格式
 *
 * 使用方式:
 * npx tsx scripts/test-ldap.ts <username> <password>
 */

import { Client } from 'ldapts'

// 忽略自簽憑證錯誤
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0'

// 嘗試兩種連線方式
const LDAP_URLS = [
  'ldaps://192.168.10.135:636', // SSL 加密
  'ldap://192.168.10.135:389', // 標準 (可能需要 STARTTLS)
]

// 測試帳號格式
const testFormats = [
  { name: 'sAMAccountName', format: (u: string) => u },
  { name: 'DOMAIN\\username', format: (u: string) => `GENTRICE\\${u}` },
  { name: 'UPN @gentrice.tw', format: (u: string) => `${u}@gentrice.tw` },
  { name: 'UPN @gentrice.com.tw', format: (u: string) => `${u}@gentrice.com.tw` },
]

// 常見 Base DN 格式
const possibleBaseDNs = [
  'DC=gentrice,DC=tw',
  'DC=gentrice,DC=com,DC=tw',
  'DC=gentrice,DC=net',
  'DC=gentrice,DC=local',
]

async function testConnection() {
  console.log('====================================')
  console.log('LDAP 連線測試')
  console.log('====================================\n')

  const args = process.argv.slice(2)
  if (args.length < 2) {
    console.log('使用方式: npx tsx scripts/test-ldap.ts <username> <password>')
    console.log('範例: npx tsx scripts/test-ldap.ts kaisermac Gen1234567890')
    process.exit(1)
  }

  const [username, password] = args

  console.log(`測試帳號: ${username}`)
  console.log(`密碼: ${'*'.repeat(password.length)}\n`)

  let successfulUrl: string | null = null
  let successfulFormat: string | null = null
  let successfulBindDN: string | null = null
  let successfulClient: Client | null = null

  // 嘗試每種 URL
  for (const ldapUrl of LDAP_URLS) {
    console.log('====================================')
    console.log(`嘗試連線: ${ldapUrl}`)
    console.log('====================================\n')

    const client = new Client({
      url: ldapUrl,
      timeout: 10000,
      connectTimeout: 10000,
      tlsOptions: {
        rejectUnauthorized: false, // 允許自簽憑證
      },
    })

    // 測試各種帳號格式
    for (const { name, format } of testFormats) {
      const bindDN = format(username)
      console.log(`嘗試: ${name}`)
      console.log(`  Bind DN: ${bindDN}`)

      try {
        await client.bind(bindDN, password)
        console.log(`  ✅ 成功！\n`)
        successfulUrl = ldapUrl
        successfulFormat = name
        successfulBindDN = bindDN
        successfulClient = client
        break
      } catch (err: any) {
        console.log(`  ❌ 失敗: ${err.message}\n`)
      }
    }

    if (successfulClient) break

    // 如果這個 URL 都失敗，嘗試下一個
    try {
      await client.unbind()
    } catch {
      // ignore
    }
  }

  if (!successfulClient || !successfulUrl) {
    console.log('\n所有連線方式都失敗了。請檢查:')
    console.log('1. 帳號密碼是否正確')
    console.log('2. LDAP 伺服器 IP 和 Port 是否正確')
    console.log('3. 防火牆是否允許連線')
    process.exit(1)
  }

  // 使用成功的格式查詢使用者資訊
  console.log('====================================')
  console.log('查詢使用者資訊')
  console.log('====================================\n')

  // 嘗試各種 Base DN
  for (const baseDN of possibleBaseDNs) {
    console.log(`嘗試 Base DN: ${baseDN}`)

    try {
      const { searchEntries } = await successfulClient.search(baseDN, {
        scope: 'sub',
        filter: `(sAMAccountName=${username})`,
        attributes: [
          'cn',
          'displayName',
          'mail',
          'sAMAccountName',
          'userPrincipalName',
          'distinguishedName',
          'memberOf',
          'department',
          'title',
        ],
        sizeLimit: 1,
      })

      if (searchEntries.length > 0) {
        console.log(`  ✅ 找到使用者！\n`)

        const user = searchEntries[0]
        console.log('使用者屬性:')
        console.log('------------------------------------')
        console.log(`  DN: ${user.dn}`)
        console.log(`  cn: ${user.cn}`)
        console.log(`  displayName: ${user.displayName}`)
        console.log(`  mail: ${user.mail}`)
        console.log(`  sAMAccountName: ${user.sAMAccountName}`)
        console.log(`  userPrincipalName: ${user.userPrincipalName}`)
        console.log(`  department: ${user.department}`)
        console.log(`  title: ${user.title}`)

        if (user.memberOf) {
          console.log(`  memberOf:`)
          const groups = Array.isArray(user.memberOf) ? user.memberOf : [user.memberOf]
          groups.slice(0, 5).forEach((g: unknown) => console.log(`    - ${g}`))
          if (groups.length > 5) {
            console.log(`    ... 還有 ${groups.length - 5} 個群組`)
          }
        }

        console.log('\n====================================')
        console.log('建議的 .env.local 設定')
        console.log('====================================\n')
        console.log(`LDAP_URL=${successfulUrl}`)
        console.log(`LDAP_BASE_DN=${baseDN}`)
        console.log(`LDAP_BIND_FORMAT=${successfulFormat}`)
        console.log(`# Bind 格式範例: ${successfulBindDN}`)

        await successfulClient.unbind()
        process.exit(0)
      }
    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : String(err)
      console.log(`  ❌ 搜尋失敗: ${errorMessage}\n`)
    }
  }

  // 如果所有 Base DN 都失敗，嘗試查詢 RootDSE 獲取預設命名上下文
  console.log('\n嘗試從 RootDSE 獲取 Base DN...\n')

  try {
    const { searchEntries } = await successfulClient.search('', {
      scope: 'base',
      filter: '(objectClass=*)',
      attributes: ['defaultNamingContext', 'rootDomainNamingContext', 'namingContexts'],
    })

    if (searchEntries.length > 0) {
      const rootDSE = searchEntries[0]
      console.log('RootDSE 資訊:')
      console.log(`  defaultNamingContext: ${rootDSE.defaultNamingContext}`)
      console.log(`  rootDomainNamingContext: ${rootDSE.rootDomainNamingContext}`)
      console.log(`  namingContexts: ${rootDSE.namingContexts}`)

      const suggestedBaseDN = rootDSE.defaultNamingContext || rootDSE.rootDomainNamingContext
      if (suggestedBaseDN) {
        console.log(`\n建議使用 Base DN: ${suggestedBaseDN}`)

        console.log('\n====================================')
        console.log('建議的 .env.local 設定')
        console.log('====================================\n')
        console.log(`LDAP_URL=${successfulUrl}`)
        console.log(`LDAP_BASE_DN=${suggestedBaseDN}`)
        console.log(`LDAP_BIND_FORMAT=${successfulFormat}`)
        console.log(`# Bind 格式範例: ${successfulBindDN}`)
      }
    }
  } catch (err: unknown) {
    const errorMessage = err instanceof Error ? err.message : String(err)
    console.log(`查詢 RootDSE 失敗: ${errorMessage}`)
  }

  await successfulClient.unbind()
}

testConnection().catch(console.error)
