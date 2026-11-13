import MarkdownIt from 'markdown-it';
import { useState, type ReactNode } from 'react';
import { Linking, Platform, ScrollView, Text, View } from 'react-native';
import * as Clipboard from 'expo-clipboard';
import { Pressable } from './locale-ui';
import { ChatGptIcon } from './chatgpt-icons';
import { useTheme } from './theme';

const parser = new MarkdownIt({ html: false, linkify: false, breaks: true });

export function safeUrl(value: string) {
  try {
    const url = new URL(value);
    return ['http:', 'https:'].includes(url.protocol) && !url.username && !url.password
      ? url.toString()
      : null;
  } catch {
    return null;
  }
}

const TOKEN_RE =
  /(\/\/[^\n]*|#[^\n]*|\/\*[\s\S]*?\*\/|"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|`(?:\\.|[^`\\])*`|\b(?:const|let|var|function|return|if|else|for|while|switch|case|break|continue|import|from|export|default|type|interface|class|extends|implements|new|async|await|try|catch|finally|throw|def|elif|pass|with|as|in|not|and|or|is|lambda|SELECT|FROM|WHERE|INSERT|UPDATE|DELETE|JOIN|ORDER|BY|GROUP|CREATE|TABLE|true|false|null|undefined|None|True|False)\b|\b\d+(?:\.\d+)?\b|\b[A-Z][A-Za-z0-9_]*\b)/g;

const KEYWORDS = new Set([
  'const',
  'let',
  'var',
  'function',
  'return',
  'if',
  'else',
  'for',
  'while',
  'switch',
  'case',
  'break',
  'continue',
  'import',
  'from',
  'export',
  'default',
  'type',
  'interface',
  'class',
  'extends',
  'implements',
  'new',
  'async',
  'await',
  'try',
  'catch',
  'finally',
  'throw',
  'def',
  'elif',
  'pass',
  'with',
  'as',
  'in',
  'not',
  'and',
  'or',
  'is',
  'lambda',
  'SELECT',
  'FROM',
  'WHERE',
  'INSERT',
  'UPDATE',
  'DELETE',
  'JOIN',
  'ORDER',
  'BY',
  'GROUP',
  'CREATE',
  'TABLE',
]);

const LITERALS = new Set(['true', 'false', 'null', 'undefined', 'None', 'True', 'False']);

function highlightCode(source: string, isDark: boolean): ReactNode[] {
  const palette = isDark
    ? {
        comment: '#7f848e',
        string: '#98c379',
        keyword: '#c678dd',
        literal: '#d19a66',
        number: '#d19a66',
        type: '#e5c07b',
      }
    : {
        comment: '#6a737d',
        string: '#15803d',
        keyword: '#9333ea',
        literal: '#c0660d',
        number: '#c0660d',
        type: '#0369a1',
      };

  const parts: ReactNode[] = [];
  let last = 0;
  let match: RegExpExecArray | null;
  TOKEN_RE.lastIndex = 0;
  let idx = 0;
  while ((match = TOKEN_RE.exec(source)) !== null) {
    if (match.index > last) {
      parts.push(source.slice(last, match.index));
    }
    const token = match[0];
    let color: string | undefined;
    if (token.startsWith('//') || token.startsWith('#') || token.startsWith('/*')) {
      color = palette.comment;
    } else if (token.startsWith('"') || token.startsWith("'") || token.startsWith('`')) {
      color = palette.string;
    } else if (KEYWORDS.has(token)) {
      color = palette.keyword;
    } else if (LITERALS.has(token) || /^\d/.test(token)) {
      color = palette.number;
    } else if (/^[A-Z]/.test(token)) {
      color = palette.type;
    }
    parts.push(
      color ? (
        <Text key={idx++} style={{ color }}>
          {token}
        </Text>
      ) : (
        token
      ),
    );
    last = match.index + token.length;
  }
  if (last < source.length) parts.push(source.slice(last));
  return parts;
}

type Token = ReturnType<typeof parser.parse>[number];
type Cell = { token: Token; header: boolean; align: 'left' | 'center' | 'right' };

function CodeBlock({ language, content }: { language: string; content: string }) {
  const { colors: c, isDark } = useTheme();
  const [copied, setCopied] = useState(false);

  function copy() {
    void Clipboard.setStringAsync(content).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    });
  }

  return (
    <View
      style={{
        borderRadius: 12,
        backgroundColor: c.codeBg,
        borderWidth: 1,
        borderColor: c.borderSubtle,
        overflow: 'hidden',
        marginVertical: 4,
      }}
    >
      <View
        style={{
          flexDirection: 'row',
          justifyContent: 'space-between',
          alignItems: 'center',
          paddingHorizontal: 14,
          paddingVertical: 7,
          backgroundColor: c.codeHeader,
        }}
      >
        <Text style={{ color: c.muted, fontSize: 12, fontWeight: '500' }}>
          {language || 'code'}
        </Text>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Copy code"
          onPress={copy}
          style={({ hovered }) => ({
            flexDirection: 'row',
            alignItems: 'center',
            gap: 5,
            paddingHorizontal: 8,
            paddingVertical: 4,
            borderRadius: 6,
            backgroundColor: hovered ? c.hover : 'transparent',
          })}
        >
          <ChatGptIcon name={copied ? 'check' : 'copy'} size={13} color={c.muted} />
          <Text style={{ color: c.muted, fontSize: 12 }}>{copied ? 'Copied' : 'Copy code'}</Text>
        </Pressable>
      </View>
      <ScrollView horizontal showsHorizontalScrollIndicator>
        <Text
          selectable
          style={{
            color: c.text,
            fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
            fontSize: 13.5,
            lineHeight: 22,
            paddingHorizontal: 14,
            paddingVertical: 12,
          }}
        >
          {highlightCode(content.trimEnd(), isDark)}
        </Text>
      </ScrollView>
    </View>
  );
}

export function Markdown({
  text,
  onCitation,
}: {
  text: string;
  onCitation?: (id: string) => void;
}) {
  const { colors: c } = useTheme();
  const tokens = parser.parse(text, {});

  function inline(children: Token[] = []): ReactNode {
    let bold = 0,
      italic = 0,
      strike = 0;
    let href: string | null = null;
    return children.map((child, i) => {
      if (child.type === 'strong_open') {
        bold++;
        return null;
      }
      if (child.type === 'strong_close') {
        bold--;
        return null;
      }
      if (child.type === 'em_open') {
        italic++;
        return null;
      }
      if (child.type === 'em_close') {
        italic--;
        return null;
      }
      if (child.type === 's_open') {
        strike++;
        return null;
      }
      if (child.type === 's_close') {
        strike--;
        return null;
      }
      if (child.type === 'link_open') {
        href = safeUrl(String(child.attrGet('href') ?? ''));
        return null;
      }
      if (child.type === 'link_close') {
        href = null;
        return null;
      }
      if (child.type === 'image') return <Text key={i}>[Image omitted]</Text>;
      if (child.type === 'softbreak' || child.type === 'hardbreak') return '\n';
      const url = href;
      return (
        <Text
          key={i}
          accessibilityRole={url ? 'link' : undefined}
          onPress={url ? () => void Linking.openURL(url) : undefined}
          style={{
            fontWeight: bold ? '600' : undefined,
            fontStyle: italic ? 'italic' : undefined,
            color: url ? c.info : undefined,
            textDecorationLine: url ? 'underline' : strike ? 'line-through' : undefined,
            fontFamily: child.type === 'code_inline' ? 'monospace' : undefined,
            fontSize: child.type === 'code_inline' ? 14 : undefined,
            backgroundColor: child.type === 'code_inline' ? c.raised : undefined,
          }}
        >
          {onCitation && child.type === 'text'
            ? child.content.split(/(\[S\d+\])/g).map((part, n) =>
                /^\[S\d+\]$/.test(part) ? (
                  <Text
                    key={n}
                    accessibilityRole="button"
                    accessibilityLabel={`Show evidence ${part}`}
                    style={{
                      color: c.info,
                      backgroundColor: c.infoSoft,
                      fontSize: 13,
                      fontWeight: '600',
                    }}
                    onPress={() => onCitation(part.slice(1, -1))}
                  >
                    {part}
                  </Text>
                ) : (
                  part
                ),
              )
            : child.content}
        </Text>
      );
    });
  }

  let cursor = 0;
  function blocks(until?: string): ReactNode[] {
    const result: ReactNode[] = [];
    while (cursor < tokens.length) {
      const key = cursor;
      const token = tokens[cursor++]!;
      if (token.type === until) break;
      if (token.type === 'table_open') {
        const rows: Cell[][] = [];
        let row: Cell[] = [];
        let header = false;
        let align: Cell['align'] = 'left';
        while (cursor < tokens.length) {
          const part = tokens[cursor++]!;
          if (part.type === 'table_close') break;
          if (part.type === 'tr_open') row = [];
          if (part.type === 'tr_close') rows.push(row);
          if (part.type === 'th_open' || part.type === 'td_open') {
            header = part.type === 'th_open';
            const alignment = String(part.attrGet('style') ?? '');
            align = alignment.includes('center')
              ? 'center'
              : alignment.includes('right')
                ? 'right'
                : 'left';
          }
          if (part.type === 'inline') row.push({ token: part, header, align });
        }
        const columns = Math.max(0, ...rows.map((r) => r.length));
        const widths = Array.from({ length: columns }, (_, column) =>
          Math.min(
            300,
            Math.max(150, ...rows.map((r) => (r[column]?.token.content.length ?? 0) * 7 + 28)),
          ),
        );
        result.push(
          <ScrollView
            key={key}
            horizontal
            showsHorizontalScrollIndicator
            nestedScrollEnabled
            style={{ maxWidth: '100%' }}
            accessibilityLabel="Scrollable table"
          >
            <View
              role="table"
              accessibilityLabel="Response table"
              style={{
                borderWidth: 1,
                borderColor: c.border,
                borderRadius: 10,
                overflow: 'hidden',
              }}
            >
              {rows.map((cells, rowIndex) => (
                <View
                  key={rowIndex}
                  role="row"
                  style={{
                    flexDirection: 'row',
                    backgroundColor: cells[0]?.header ? c.raised : 'transparent',
                  }}
                >
                  {cells.map((cell, column) => (
                    <View
                      key={column}
                      role={cell.header ? 'columnheader' : 'cell'}
                      style={{
                        width: widths[column],
                        paddingHorizontal: 12,
                        paddingVertical: 10,
                        borderTopWidth: rowIndex ? 1 : 0,
                        borderLeftWidth: column ? 1 : 0,
                        borderColor: c.border,
                      }}
                    >
                      <Text
                        selectable
                        style={{
                          color: c.text,
                          fontSize: 14,
                          lineHeight: 21,
                          fontWeight: cell.header ? '600' : '400',
                          textAlign: cell.align,
                        }}
                      >
                        {inline(cell.token.children ?? [])}
                      </Text>
                    </View>
                  ))}
                </View>
              ))}
            </View>
          </ScrollView>,
        );
        continue;
      }
      if (token.type === 'bullet_list_open' || token.type === 'ordered_list_open') {
        const ordered = token.type === 'ordered_list_open';
        let number = Number(token.attrGet('start') ?? 1);
        const items: ReactNode[] = [];
        const close = ordered ? 'ordered_list_close' : 'bullet_list_close';
        while (cursor < tokens.length && tokens[cursor]!.type !== close) {
          if (tokens[cursor++]!.type !== 'list_item_open') continue;
          const itemKey = cursor;
          const content = blocks('list_item_close');
          items.push(
            <View key={itemKey} style={{ flexDirection: 'row', gap: 10, alignItems: 'flex-start' }}>
              <Text
                selectable
                style={{
                  color: c.text,
                  fontSize: 16,
                  lineHeight: 26,
                  minWidth: ordered ? 22 : 12,
                }}
              >
                {ordered ? `${number++}.` : '•'}
              </Text>
              <View style={{ flex: 1, minWidth: 0, gap: 6 }}>{content}</View>
            </View>,
          );
        }
        cursor++;
        result.push(
          <View key={key} style={{ gap: 6, paddingLeft: 4 }}>
            {items}
          </View>,
        );
        continue;
      }
      if (token.type === 'blockquote_open') {
        result.push(
          <View
            key={key}
            style={{ borderLeftWidth: 3, borderColor: c.border, paddingLeft: 14, gap: 8 }}
          >
            {blocks('blockquote_close')}
          </View>,
        );
        continue;
      }
      if (token.type === 'fence' || token.type === 'code_block') {
        result.push(<CodeBlock key={key} language={token.info} content={token.content} />);
        continue;
      }
      if (token.type === 'hr') {
        result.push(
          <View key={key} style={{ height: 1, backgroundColor: c.border, marginVertical: 8 }} />,
        );
        continue;
      }
      if (token.type === 'heading_open') {
        const level = Number(token.tag.slice(1));
        const content = tokens[cursor++];
        cursor++;
        result.push(
          <Text
            key={key}
            accessibilityRole="header"
            selectable
            style={{
              color: c.text,
              fontSize: level === 1 ? 24 : level === 2 ? 20 : 18,
              lineHeight: level === 1 ? 32 : level === 2 ? 28 : 26,
              fontWeight: '600',
              marginTop: 10,
            }}
          >
            {inline(content?.children ?? [])}
          </Text>,
        );
        continue;
      }
      if (token.type === 'inline')
        result.push(
          <Text key={key} selectable style={{ color: c.text, fontSize: 16, lineHeight: 26 }}>
            {inline(token.children ?? [])}
          </Text>,
        );
    }
    return result;
  }

  return <View style={{ gap: 12, minWidth: 0 }}>{blocks()}</View>;
}
