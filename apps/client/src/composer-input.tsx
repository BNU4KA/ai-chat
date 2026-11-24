import {
  memo,
  useEffect,
  useImperativeHandle,
  useLayoutEffect,
  useRef,
  useState,
  type ComponentRef,
  type RefObject,
  type Ref,
} from 'react';
import {
  Platform,
  StyleSheet,
  type TextInputContentSizeChangeEvent,
  type TextInputKeyPressEvent,
} from 'react-native';
import { BRAND_NAME } from './sidebar';
import { composerShape, type ComposerShape } from './composer-shape';
import { Field } from './ui';

export interface ComposerHandle {
  setText: (text: string) => void;
  focus: () => void;
}

export interface ComposerInputProps {
  ref?: Ref<ComposerHandle>;
  textRef: RefObject<string>;
  expanded: boolean;
  layoutKey: string;
  onShapeChange: (shape: ComposerShape) => void;
  onSubmit: () => void;
  onFocusChange: (focused: boolean) => void;
  onPasteFile?: (file: File) => void;
}

const MIN_HEIGHT = 24;
const MAX_HEIGHT = 200;
const MAX_EXPANDED_HEIGHT = 480;

interface WebKeyEvent {
  key: string;
  shiftKey?: boolean;
  isComposing?: boolean;
}

function ComposerInputView({
  ref,
  textRef,
  expanded,
  layoutKey,
  onShapeChange,
  onSubmit,
  onFocusChange,
  onPasteFile,
}: ComposerInputProps) {
  const [text, setTextState] = useState(textRef.current);
  const [height, setHeight] = useState(MIN_HEIGHT);
  const field = useRef<ComponentRef<typeof Field>>(null);
  const hadText = useRef(!!textRef.current.trim());
  const focusedAt = useRef(0);

  const update = (next: string) => {
    textRef.current = next;
    setTextState(next);
    if (!next) setHeight(MIN_HEIGHT);
  };

  useImperativeHandle(ref, () => ({
    setText: update,
    focus: () => field.current?.focus(),
  }));

  useEffect(() => {
    if (Platform.OS !== 'web' || !onPasteFile) return;
    const element = field.current as unknown as HTMLTextAreaElement | null;
    if (!element?.addEventListener) return;
    const onPaste = (event: ClipboardEvent) => {
      const items = Array.from(event.clipboardData?.items ?? []);
      const image = items.find((item) => item.kind === 'file' && item.type.startsWith('image/'));
      const file = image?.getAsFile();
      if (!file) return;
      event.preventDefault();
      onPasteFile(file);
    };
    element.addEventListener('paste', onPaste);
    return () => element.removeEventListener('paste', onPaste);
  }, [onPasteFile]);

  useLayoutEffect(() => {
    if (Platform.OS !== 'web') return;
    const element = field.current as unknown as HTMLTextAreaElement | null;
    if (!element || typeof element.scrollHeight !== 'number') return;
    element.style.height = `${MIN_HEIGHT}px`;
    const next = text ? Math.min(MAX_HEIGHT, Math.max(MIN_HEIGHT, element.scrollHeight)) : MIN_HEIGHT;
    element.style.height = `${next}px`;
    setHeight(next);
    const now = !!text.trim();
    if (
      now &&
      !hadText.current &&
      Date.now() - focusedAt.current < 500 &&
      document.activeElement !== element
    ) {
      element.focus();
    }
    hadText.current = now;
  }, [text, layoutKey]);

  const shape = composerShape(text, height);
  useEffect(() => {
    onShapeChange(shape);
  }, [shape.hasText, shape.multiline, shape.tall, onShapeChange]);

  const onContentSizeChange = (event: TextInputContentSizeChangeEvent) => {
    if (Platform.OS === 'web') return;
    const next = Math.min(
      MAX_HEIGHT,
      Math.max(MIN_HEIGHT, Math.ceil(event.nativeEvent.contentSize.height)),
    );
    setHeight((prev) => (Math.abs(prev - next) < 1 ? prev : next));
  };

  const onKeyPress = (event: TextInputKeyPressEvent) => {
    if (Platform.OS !== 'web') return;
    const key = event.nativeEvent as unknown as WebKeyEvent;
    if (key.key === 'Enter' && !key.shiftKey && !key.isComposing) {
      event.preventDefault();
      onSubmit();
    }
  };

  const maxHeight = expanded ? MAX_EXPANDED_HEIGHT : MAX_HEIGHT;
  return (
    <Field
      ref={field}
      accessibilityLabel="Message"
      placeholder={`Ask ${BRAND_NAME}`}
      value={text}
      onChangeText={update}
      multiline
      scrollEnabled={height >= maxHeight}
      onContentSizeChange={onContentSizeChange}
      onFocus={() => {
        focusedAt.current = Date.now();
        onFocusChange(true);
      }}
      onBlur={() => onFocusChange(false)}
      onKeyPress={onKeyPress}
      style={[
        styles.input,
        { minHeight: height, maxHeight },
        Platform.OS === 'web' && [
          { height },
          { overflowY: height >= MAX_HEIGHT ? 'auto' : 'hidden', resize: 'none' } as object,
        ],
      ]}
    />
  );
}

export const ComposerInput = memo(ComposerInputView);

const styles = StyleSheet.create({
  input: {
    borderWidth: 0,
    backgroundColor: 'transparent',
    outlineWidth: 0,
    paddingHorizontal: 6,
    paddingVertical: 0,
    fontSize: 16,
    lineHeight: 24,
  },
});
