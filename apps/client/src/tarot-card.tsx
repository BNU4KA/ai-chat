import Svg, { Circle, Path, Rect, Text as SvgText } from 'react-native-svg';
export const arcana = [
  'The Fool',
  'The Magician',
  'The High Priestess',
  'The Empress',
  'The Emperor',
  'The Hierophant',
  'The Lovers',
  'The Chariot',
  'Strength',
  'The Hermit',
  'Wheel of Fortune',
  'Justice',
  'The Hanged Man',
  'Death',
  'Temperance',
  'The Devil',
  'The Tower',
  'The Star',
  'The Moon',
  'The Sun',
  'Judgement',
  'The World',
];
const motifs = [
  '',
  'M20 61h24M24 61V44h16v17M32 44V26m-6 5 6-5 6 5M20 24c-8-8 8-8 12 0 4 8 20 8 12 0-4-8-12 0-12 0',
  'M16 69V28h7v41m18 0V28h7v41M28 42h8v21h-8ZM28 23a6 6 0 0 0 8 0 6 6 0 1 1-8 0',
  'M17 67 5-25 10 7 10-7 5 25ZM19 37l4-8 9 4 9-4 4 8M32 53v10m-5-5h10',
  'M18 68V38h28v30M22 38v-8h20v8M27 30v-7h10v7M25 52h14m-7-7v14',
  'M22 68V37h20v31M22 37l10-12 10 12M32 29v24m-7-12h14M17 62l10-7m20 7-10-7',
  'M20 64V48m24 16V48M24 37l8 8 8-8c8-9-8-14-8-6-1-8-17-3-8 6ZM20 48l12 8 12-8',
  'M18 59h28l-3-22H21ZM22 59l-4 7m24-7 4 7M32 37V25m-5 5 5-5 5 5M25 47h14',
  'M15 55c0-15 22-17 28-5 10 17-17 25-21 9M27 52c5-8 14-4 13 3M27 31c-12-10 18-10 10 0-4 5-9 2-10 0',
  'M19 69l5-29 8-13 9 16-1 26ZM42 36l8 8v12H40V44ZM45 47v6m-3-3h6M26 39l-6 23',
  'M32 27a20 20 0 1 0 0 40 20 20 0 0 0 0-40ZM32 27v40M12 47h40M18 33l28 28m0-28L18 61M32 39a8 8 0 1 0 0 16 8 8 0 0 0 0-16',
  'M32 23v46M20 69h24M18 36h28M20 36l-7 18h14ZM44 36l-7 18h14ZM27 30h10',
  'M16 27h32M22 27v13l18 17M35 27v25l-10 9M31 61v8M25 69h12',
  'M18 66l29-33M20 33l20 29M26 29h13v14H26ZM26 43l-7 15m20-15 7 15M20 69h24',
  'M22 29h8v12h-8Zm13 27h8v12h-8ZM26 41c0 13 13 3 13 15M15 68l17-20 17 20',
  'M20 40l-5-10 15 7m14 3 5-10-15 7M20 40h24l-4 20H24ZM25 61l-8 7m22-7 8 7M27 47h1m8 0h1',
  'M22 70V39h20v31M19 39h26M28 39l10-16-7 3 8-9M15 50l-5 7m39-7 5 7M28 54h8',
  'M32 27l3 11 11 3-11 3-3 11-3-11-11-3 11-3ZM14 24v6m-3-3h6m36 2v6m-3-3h6M20 65c8-6 16 6 24 0',
  'M37 24a15 15 0 1 0 8 23 12 12 0 0 1-8-23ZM15 70V54h8v16m18 0V54h8v16M27 66l5-8 5 8',
  'M32 35a12 12 0 1 0 0 24 12 12 0 0 0 0-24ZM32 25v-5m0 49v5M10 47H5m49 0h5M16 31l-4-4m36 4 4-4m-36 36-4 4m36-4 4 4',
  'M16 28h20l10 11H28ZM28 39v19M17 68V53h10v15m10 0V53h10v15M30 24v9m-4-4h8',
  'M32 23c-25 0-25 48 0 48s25-48 0-48ZM26 36l12 22m0-22L26 58M12 26h4m-2-2v4m34-2h4m-2-2v4M12 68h4m32 0h4',
];
export function TarotCard({ index = 0, height = 64 }: { index?: number; height?: number }) {
  const card = ((index % 22) + 22) % 22;
  return (
    <Svg
      width={(height * 64) / 88}
      height={height}
      viewBox="0 0 64 88"
      aria-hidden={true}
      focusable={false}
    >
      <Rect
        x={1}
        y={1}
        width={62}
        height={86}
        rx={5}
        fill="#f4edda"
        stroke="#bd9b55"
        strokeWidth={1.5}
      />
      <Rect
        x={5}
        y={5}
        width={54}
        height={78}
        rx={2}
        fill="none"
        stroke="#c5ab70"
        strokeWidth={0.7}
      />
      <SvgText x={32} y={14} fill="#7f6638" fontSize={8} textAnchor="middle">
        {card === 0
          ? '0'
          : [
              '',
              'I',
              'II',
              'III',
              'IV',
              'V',
              'VI',
              'VII',
              'VIII',
              'IX',
              'X',
              'XI',
              'XII',
              'XIII',
              'XIV',
              'XV',
              'XVI',
              'XVII',
              'XVIII',
              'XIX',
              'XX',
              'XXI',
            ][card]}
      </SvgText>
      {card === 0 ? (
        <>
          <Circle cx={47} cy={24} r={6} fill="#dfb95f" />
          <Path
            d="M47 14v2m0 16v2m-10-10h2m16 0h2m-17-7 2 2m10 10 2 2m0-14-2 2"
            stroke="#cda74e"
            strokeWidth={1}
          />
          <Path d="M8 70 24 63 37 70 31 81H8Z" fill="#d2b987" />
          <Path d="m24 64 13 6-5 5" fill="none" stroke="#a28b64" strokeWidth={1} />
          <Path d="m26 53-3 13m8-12 8 9" stroke="#725743" strokeWidth={3} strokeLinecap="round" />
          <Path d="m24 39-6 16 16 2-5-18" fill="#8e9e87" stroke="#64745e" strokeWidth={1} />
          <Circle cx={28} cy={32} r={4.5} fill="#ddbc94" />
          <Path d="m23 28 10-2-3 5" fill="#bc715d" />
          <Path d="m23 41-9-5m16 5 8-9" stroke="#725743" strokeWidth={2} strokeLinecap="round" />
          <Path d="m16 36 29-9" stroke="#755b46" strokeWidth={1.6} />
          <Circle cx={42} cy={28} r={4} fill="#bd866c" />
          <Path d="m13 36-2-8" stroke="#81956c" strokeWidth={1} />
          <Circle cx={11} cy={27} r={2.5} fill="#fffdf2" stroke="#c4af7e" strokeWidth={0.5} />
          <Path
            d="m40 65 6-5 6 2-3 6h-8m4-7 1-5m3 7 6-2"
            fill="#fffdf4"
            stroke="#9d8b6a"
            strokeWidth={1}
            strokeLinejoin="round"
          />
          <Path d="M9 78h16m18 0h11" stroke="#c5ae7a" strokeWidth={0.7} />
        </>
      ) : (
        <>
          <Circle
            cx={32}
            cy={47}
            r={23}
            fill={['#e4ddbe', '#e5d5c1', '#dbe0cc'][card % 3]}
            opacity={0.7}
          />
          <Path
            d={motifs[card]}
            fill="none"
            stroke="#806b46"
            strokeWidth={1.6}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </>
      )}
      <SvgText
        x={32}
        y={80}
        fill="#806b46"
        fontSize={card === 2 ? 3.6 : 4.2}
        letterSpacing={0.3}
        textAnchor="middle"
      >
        {arcana[card]!.toUpperCase()}
      </SvgText>
    </Svg>
  );
}
