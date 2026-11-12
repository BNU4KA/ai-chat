import MarkdownIt from 'markdown-it';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Linking, Platform, ScrollView, Text, View } from 'react-native';
import * as Clipboard from 'expo-clipboard';
import { useReducedMotion } from './motion';
import { revealStep } from './smooth-text';
import { useTheme } from './theme';
import { Button } from './ui';
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
type Token = ReturnType<typeof parser.parse>[number];
type Cell = { token: Token; header: boolean; align: 'left' | 'center' | 'right' };
function useSmoothText(text: string, smooth: boolean) {
  const reduced = useReducedMotion();
  const target = useRef(text);
  const previous = useRef('');
  const countRef = useRef(0);
  const follow = useRef(false);
  const [count, setCount] = useState(0);
  target.current = text;
  if (smooth && !reduced) follow.current = true;
  const live = follow.current && !reduced && (smooth || count < text.length);
  useEffect(() => {
    if (reduced) {
      countRef.current = target.current.length;
      setCount(target.current.length);
      return;
    }
    if (!live) return;
    if (previous.current && !text.startsWith(previous.current)) {
      countRef.current = 0;
      setCount(0);
    }
    previous.current = text;
    let frame = 0;
    let stopped = false;
    const tick = () => {
      if (stopped) return;
      const next = revealStep(countRef.current, target.current.length);
      if (next !== countRef.current) {
        countRef.current = next;
        setCount(next);
      }
      if (countRef.current < target.current.length) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => {
      stopped = true;
      cancelAnimationFrame(frame);
    };
  }, [live, reduced, text]);
  if (!follow.current || reduced) return text;
  return text.slice(0, count);
}
export function Markdown({
  text,
  smooth = false,
  onCitation,
}: {
  text: string;
  smooth?: boolean;
  onCitation?: (id: string) => void;
}) {
  const shown = useSmoothText(text, smooth);
  const { colors: c } = useTheme();
  const tokens = parser.parse(shown, {});
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
            fontWeight: bold ? '700' : undefined,
            fontStyle: italic ? 'italic' : undefined,
            color: url ? c.accent : undefined,
            textDecorationLine: url ? 'underline' : strike ? 'line-through' : undefined,
            fontFamily: child.type === 'code_inline' ? 'monospace' : undefined,
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
                    style={{ color: c.accent, textDecorationLine: 'underline' }}
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
        const columns = Math.max(0, ...rows.map((row) => row.length));
        const widths = Array.from({ length: columns }, (_, column) =>
          Math.min(
            300,
            Math.max(160, ...rows.map((row) => (row[column]?.token.content.length ?? 0) * 7 + 28)),
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
                borderRadius: 12,
                overflow: 'hidden',
              }}
            >
              {rows.map((cells, rowIndex) => (
                <View
                  key={rowIndex}
                  role="row"
                  style={{
                    flexDirection: 'row',
                    backgroundColor: cells[0]?.header
                      ? c.raised
                      : rowIndex % 2 === 0
                        ? c.surface
                        : 'transparent',
                  }}
                >
                  {cells.map((cell, column) => (
                    <View
                      key={column}
                      role={cell.header ? 'columnheader' : 'cell'}
                      style={{
                        width: widths[column],
                        padding: 12,
                        borderTopWidth: rowIndex ? 1 : 0,
                        borderLeftWidth: column ? 1 : 0,
                        borderColor: c.border,
                      }}
                    >
                      <Text
                        selectable
                        style={{
                          color: c.text,
                          fontSize: 15,
                          lineHeight: 23,
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
            <View key={itemKey} style={{ flexDirection: 'row', gap: 8, alignItems: 'flex-start' }}>
              <Text
                selectable
                style={{ color: c.text, fontSize: 16, lineHeight: 25, minWidth: ordered ? 24 : 14 }}
              >
                {ordered ? `${number++}.` : '•'}
              </Text>
              <View style={{ flex: 1, minWidth: 0, gap: 8 }}>{content}</View>
            </View>,
          );
        }
        cursor++;
        result.push(
          <View key={key} style={{ gap: 8, paddingLeft: 4 }}>
            {items}
          </View>,
        );
        continue;
      }
      if (token.type === 'blockquote_open') {
        result.push(
          <View
            key={key}
            style={{ borderLeftWidth: 3, borderColor: c.border, paddingLeft: 14, gap: 10 }}
          >
            {blocks('blockquote_close')}
          </View>,
        );
        continue;
      }
      if (token.type === 'fence' || token.type === 'code_block') {
        result.push(
          <View
            key={key}
            style={{ borderRadius: 10, backgroundColor: c.raised, padding: 12, gap: 8 }}
          >
            <View
              style={{
                flexDirection: 'row',
                justifyContent: 'space-between',
                alignItems: 'center',
              }}
            >
              <Text style={{ color: c.muted, fontSize: 12 }}>{token.info || 'code'}</Text>
              <Button
                secondary
                label="Copy code"
                onPress={() => void Clipboard.setStringAsync(token.content)}
              >
                Copy
              </Button>
            </View>
            <ScrollView horizontal>
              <Text
                selectable
                style={{
                  color: c.text,
                  fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
                  fontSize: 13,
                  lineHeight: 21,
                }}
              >
                {token.content.trimEnd()}
              </Text>
            </ScrollView>
          </View>,
        );
        continue;
      }
      if (token.type === 'hr') {
        result.push(
          <View key={key} style={{ height: 1, backgroundColor: c.border, marginVertical: 4 }} />,
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
              fontSize: level === 1 ? 26 : level === 2 ? 23 : 21,
              lineHeight: 32,
              fontWeight: '600',
              marginTop: 8,
            }}
          >
            {inline(content?.children ?? [])}
          </Text>,
        );
        continue;
      }
      if (token.type === 'inline')
        result.push(
          <Text key={key} selectable style={{ color: c.text, fontSize: 16, lineHeight: 25 }}>
            {inline(token.children ?? [])}
          </Text>,
        );
    }
    return result;
  }
  return <View style={{ gap: 12, minWidth: 0 }}>{blocks()}</View>;
}
