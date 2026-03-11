/**
 * LINE 聊天記錄匯入解析器
 * 解析 LINE 匯出的 txt 格式聊天記錄
 */

export interface ParsedMessage {
  timestamp: Date;
  senderName: string;
  messageType: 'text' | 'sticker' | 'image' | 'video' | 'audio' | 'file' | 'location' | 'unsent';
  content: string | null;
}

export interface ParsedChatHistory {
  groupName: string;
  saveDate: Date;
  messages: ParsedMessage[];
}

/**
 * 解析時間字串，例如 "下午04:57" 或 "上午10:41"
 */
function parseTime(timeStr: string, dateStr: string): Date {
  // 解析日期 YYYY/MM/DD
  const dateMatch = dateStr.match(/(\d{4})\/(\d{2})\/(\d{2})/);
  if (!dateMatch) {
    throw new Error(`無法解析日期: ${dateStr}`);
  }
  const [, year, month, day] = dateMatch;

  // 解析時間 上午/下午HH:mm
  const timeMatch = timeStr.match(/(上午|下午)(\d{1,2}):(\d{2})/);
  if (!timeMatch) {
    throw new Error(`無法解析時間: ${timeStr}`);
  }
  const [, period, hourStr, minute] = timeMatch;
  let hour = parseInt(hourStr, 10);

  // 轉換為 24 小時制
  if (period === '下午' && hour !== 12) {
    hour += 12;
  } else if (period === '上午' && hour === 12) {
    hour = 0;
  }

  return new Date(
    parseInt(year, 10),
    parseInt(month, 10) - 1,
    parseInt(day, 10),
    hour,
    parseInt(minute, 10)
  );
}

/**
 * 判斷訊息類型
 */
function detectMessageType(content: string): { type: ParsedMessage['messageType']; content: string | null } {
  // 貼圖
  if (content === '[貼圖]') {
    return { type: 'sticker', content: null };
  }
  // 照片
  if (content === '[照片]' || content === '[圖片]') {
    return { type: 'image', content: null };
  }
  // 影片
  if (content === '[影片]') {
    return { type: 'video', content: null };
  }
  // 語音訊息
  if (content === '[語音訊息]') {
    return { type: 'audio', content: null };
  }
  // 檔案
  if (content === '[檔案]' || content.startsWith('[檔案]')) {
    return { type: 'file', content: content.replace('[檔案]', '').trim() || null };
  }
  // 位置
  if (content === '[位置資訊]' || content === '[地點]') {
    return { type: 'location', content: null };
  }
  // 收回訊息
  if (content === '[已收回訊息]' || content.includes('已收回訊息')) {
    return { type: 'unsent', content: null };
  }
  // 相簿
  if (content.startsWith('[相簿]')) {
    return { type: 'image', content: content };
  }
  // 通話
  if (content === '[未接來電]' || content === '[通話]' || content.includes('通話時間')) {
    return { type: 'text', content: content };
  }
  // 一般文字
  return { type: 'text', content };
}

/**
 * 解析 LINE 聊天記錄 txt 檔案
 */
export function parseLineChatExport(text: string): ParsedChatHistory {
  const lines = text.split('\n');

  // 解析標題行 - [LINE] 群組名稱的聊天記錄
  const headerMatch = lines[0]?.match(/\[LINE\]\s*(.+?)的聊天記錄/);
  if (!headerMatch) {
    throw new Error('無法解析檔案標題，請確認是 LINE 匯出的聊天記錄格式');
  }
  const groupName = headerMatch[1].trim();

  // 解析儲存日期
  const saveDateMatch = lines[1]?.match(/儲存日期[：:]\s*(\d{4}\/\d{2}\/\d{2})\s+(\d{2}:\d{2})/);
  if (!saveDateMatch) {
    throw new Error('無法解析儲存日期');
  }
  const [, saveDateStr, saveTimeStr] = saveDateMatch;
  const [saveYear, saveMonth, saveDay] = saveDateStr.split('/').map(Number);
  const [saveHour, saveMin] = saveTimeStr.split(':').map(Number);
  const saveDate = new Date(saveYear, saveMonth - 1, saveDay, saveHour, saveMin);

  const messages: ParsedMessage[] = [];
  let currentDate = '';
  let currentMessageLines: string[] = [];
  let currentSender = '';
  let currentTime = '';

  // 處理累積的訊息
  const flushMessage = () => {
    if (currentMessageLines.length > 0 && currentSender && currentTime && currentDate) {
      const fullContent = currentMessageLines.join('\n').trim();
      const { type, content } = detectMessageType(fullContent);

      try {
        messages.push({
          timestamp: parseTime(currentTime, currentDate),
          senderName: currentSender,
          messageType: type,
          content,
        });
      } catch (e) {
        console.warn(`跳過無法解析的訊息: ${currentTime} ${currentSender}`);
      }
    }
    currentMessageLines = [];
    currentSender = '';
    currentTime = '';
  };

  for (let i = 2; i < lines.length; i++) {
    const line = lines[i];

    // 空行
    if (!line.trim()) {
      continue;
    }

    // 日期行 - YYYY/MM/DD（星期）
    // 星期可能是一個中文字（一、二、三...日）
    const dateLineMatch = line.match(/^(\d{4}\/\d{2}\/\d{2})（[一二三四五六日]）$/);
    if (dateLineMatch) {
      flushMessage();
      currentDate = dateLineMatch[1];
      continue;
    }

    // 訊息行 - 時間\t發送者\t內容
    // LINE 匯出使用 tab 分隔
    const messageMatch = line.match(/^(上午|下午)(\d{1,2}:\d{2})\t(.+?)\t(.*)$/);
    if (messageMatch) {
      flushMessage();
      const [, period, time, sender, content] = messageMatch;
      currentTime = `${period}${time}`;
      currentSender = sender.trim();
      currentMessageLines = [content];
      continue;
    }

    // 也嘗試匹配多個空格的情況（某些系統會轉換 tab 為空格）
    const messageMatchSpaces = line.match(/^(上午|下午)(\d{1,2}:\d{2})\s{2,}(.+?)\s{2,}(.*)$/);
    if (messageMatchSpaces) {
      flushMessage();
      const [, period, time, sender, content] = messageMatchSpaces;
      currentTime = `${period}${time}`;
      currentSender = sender.trim();
      currentMessageLines = [content];
      continue;
    }

    // 可能是多行訊息的延續
    // 如果這行開頭不是時間格式，且我們有當前訊息在處理中
    if (currentMessageLines.length > 0) {
      currentMessageLines.push(line);
    }
  }

  // 處理最後一則訊息
  flushMessage();

  return {
    groupName,
    saveDate,
    messages,
  };
}

/**
 * 為匯入的使用者生成唯一 ID（基於顯示名稱的 hash）
 */
export function generateImportedUserId(displayName: string, groupName: string): string {
  // 使用簡單的 hash 函數生成唯一 ID
  const str = `imported_${groupName}_${displayName}`;
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash; // Convert to 32bit integer
  }
  return `imported_${Math.abs(hash).toString(36)}`;
}

/**
 * 為匯入的訊息生成唯一 ID
 */
export function generateImportedMessageId(
  groupName: string,
  senderName: string,
  timestamp: Date,
  content: string | null,
  index: number
): string {
  const str = `${groupName}_${senderName}_${timestamp.getTime()}_${content || ''}_${index}`;
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash;
  }
  return `imported_${Math.abs(hash).toString(36)}_${index}`;
}
