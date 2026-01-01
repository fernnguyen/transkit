/**
 * Format Utilities for HTML/Markdown Conversion
 * Preserves formatting during translation by converting HTML to Markdown and back
 */

/**
 * Check if text contains HTML tags that need format conversion
 * @param {string} text - Text to check
 * @returns {boolean} - True if text contains HTML tags
 */
export function shouldConvertFormat(text) {
  if (!text || typeof text !== 'string') return false;
  return /<[a-z][^>]*>/i.test(text);
}

/**
 * Convert HTML to Markdown before translation
 * Preserves formatting like bold, italic, code, lists, etc.
 * @param {string} htmlContent - HTML content to convert
 * @returns {string} - Markdown representation
 */
export function htmlToMarkdown(htmlContent) {
  if (!htmlContent) return '';
  
  let md = htmlContent
    // Code blocks (preserve before other conversions)
    .replace(/<pre[^>]*>([\s\S]*?)<\/pre>/gi, '```\n$1\n```')
    .replace(/<code[^>]*>(.*?)<\/code>/gi, '`$1`')
    
    // Links - convert to markdown [text](url)
    .replace(/<a[^>]*href=["']([^"']*)["'][^>]*>(.*?)<\/a>/gi, '[$2]($1)')
    
    // Line breaks
    .replace(/<br\s*\/?>/gi, '\n')
    
    // Bold
    .replace(/<(b|strong)[^>]*>(.*?)<\/\1>/gi, '**$2**')
    
    // Italic
    .replace(/<(i|em)[^>]*>(.*?)<\/\1>/gi, '_$2_')
    
    // Strikethrough
    .replace(/<(s|strike)[^>]*>(.*?)<\/\1>/gi, '~~$2~~')
    
    // Underline (keep as-is for HTML compatibility)
    .replace(/<u[^>]*>(.*?)<\/u>/gi, '<u>$1</u>')
    
    // Lists
    .replace(/<li[^>]*>(.*?)<\/li>/gi, '- $1\n')
    .replace(/<(ul|ol)[^>]*>|<\/(ul|ol)>/gi, '')
    
    // Strip remaining HTML tags (except <u>)
    .replace(/<(?!u|\/u)[^>]+>/g, '');

  return md.trim();
}

/**
 * Convert Markdown back to HTML after translation
 * @param {string} markdownContent - Markdown content to convert
 * @returns {string} - HTML representation
 */
export function markdownToHtml(markdownContent) {
  if (!markdownContent) return '';
  
  let html = markdownContent
    // Code blocks (process first to avoid interference)
    .replace(/```([\s\S]*?)```/g, '<pre>$1</pre>')
    .replace(/`(.*?)`/g, '<code>$1</code>')
    
    // Links - convert [text](url) to <a>
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2">$1</a>')
    
    // Bold
    .replace(/\*\*(.*?)\*\*/g, '<b>$1</b>')
    
    // Italic
    .replace(/_(.*?)_/g, '<i>$1</i>')
    
    // Strikethrough
    .replace(/~~(.*?)~~/g, '<s>$1</s>')
    
    // Underline (already in HTML format)
    .replace(/<u>(.*?)<\/u>/g, '<u>$1</u>')
    
    // Lists - convert "- item" to "<li>item</li>"
    .replace(/^- (.+)$/gm, '<li>$1</li>');

  // Wrap lists BEFORE adding <br> tags
  if (html.includes('<li>')) {
    const lines = html.split('\n');
    const result = [];
    let inList = false;
    let currentList = [];
    
    lines.forEach(line => {
      if (line.startsWith('<li>')) {
        if (!inList) {
          inList = true;
          currentList = [];
        }
        currentList.push(line);
      } else {
        if (inList) {
          // End of list, wrap it
          result.push(`<ul>${currentList.join('')}</ul>`);
          currentList = [];
          inList = false;
        }
        if (line.trim()) {
          result.push(line);
        }
      }
    });
    
    // Handle remaining list
    if (currentList.length > 0) {
      result.push(`<ul>${currentList.join('')}</ul>`);
    }
    
    html = result.join('<br>');
  } else {
    html = html.replace(/\n/g, '<br>');
  }
  
  // Normalize multiple consecutive <br> tags to single <br>
  // This handles cases where original HTML had <br> that became \n then <br> again
  html = html.replace(/(<br\s*\/?>[\s\n]*)+/gi, '<br>');

  return html;
}
